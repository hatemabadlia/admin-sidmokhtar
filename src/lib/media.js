// src/lib/media.js — فيديو الدروس على Cloudflare R2 عبر الـ Worker (workers/r2-exams)
//
// التدفّق عند رفع درس:
//  1) lessonMediaKeys()  → مسار فريد: lessons/<level>/<module>/<ts>-<rand>/{video.mp4, thumb.jpg}
//  2) captureThumbnail() → صورة مصغّرة من الفيديو داخل المتصفح (canvas) — بلا خدمة خارجية
//  3) uploadLessonVideo() → رفع على أجزاء (Multipart) عبر الـ Worker: حدّ الطلب 100MB في Workers
//                           فنرسل أجزاء 32MB مع إعادة محاولة لكل جزء ونسبة تقدّم.
//  4) uploadThumbnail()  → PUT عادي (صورة صغيرة)
//  المشاهدة: الطالب يطلب رابطًا موقّعًا من /media/play-url (انظر واجهة الطالب).
import { auth } from '../firebase/config';
import { R2_WORKER_URL, r2PublicUrl, deleteFromR2 } from './r2';

const PART_SIZE = 32 * 1024 * 1024; // R2: كل الأجزاء بنفس الحجم (≥ 5MB) عدا الأخير
const PART_RETRIES = 4;
export const MAX_VIDEO_BYTES = 4 * 1024 * 1024 * 1024; // 4GB

const VIDEO_TYPES = { mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm' };

async function idToken() {
  const user = auth.currentUser;
  if (!user) throw new Error('يجب تسجيل الدخول أولًا.');
  return user.getIdToken();
}

async function workerJson(path, init = {}) {
  if (!R2_WORKER_URL) throw new Error('VITE_R2_WORKER_URL غير مضبوط في ملف .env');
  const token = await idToken();
  const res = await fetch(`${R2_WORKER_URL}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(init.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) throw new Error('غير مصرّح — تأكد أن حسابك مشرف.');
    throw new Error(data.error || `فشل الطلب (${res.status})`);
  }
  return data;
}

/** يتحقق من نوع/حجم الفيديو ويعيد نوع المحتوى والامتداد، أو يرمي خطأ عربيًا واضحًا. */
export function inspectVideoFile(file) {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  const contentType = VIDEO_TYPES[ext] || (/^video\/(mp4|webm)$/.test(file.type) ? file.type : '');
  if (!contentType) throw new Error('صيغة الفيديو غير مدعومة — ارفع ملف MP4 (H.264) أو WebM.');
  if (file.size > MAX_VIDEO_BYTES) throw new Error('حجم الفيديو أكبر من 4GB — اضغطه قبل الرفع.');
  return { contentType, ext: contentType === 'video/webm' ? 'webm' : 'mp4' };
}

/** مفاتيح R2 لدرس جديد (مجلّد فريد يجمع الفيديو والصورة المصغّرة). */
export function lessonMediaKeys({ level, module, ext = 'mp4' }) {
  const rand = Math.random().toString(36).slice(2, 8);
  const folder = `lessons/${level}/${module}/${Date.now()}-${rand}`;
  return { folder, videoKey: `${folder}/video.${ext}`, thumbKey: `${folder}/thumb.jpg` };
}

export const thumbnailUrl = (thumbKey) => (thumbKey ? r2PublicUrl(thumbKey) : '');

/** رفع جزء واحد عبر XHR (لنسبة التقدّم) مع إعادة المحاولة. */
function putPart({ key, uploadId, partNumber, blob, token, onProgress }) {
  const attempt = (n) =>
    new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const qs = new URLSearchParams({ key, uploadId, partNumber: String(partNumber) });
      xhr.open('PUT', `${R2_WORKER_URL}/media/upload/part?${qs}`);
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.setRequestHeader('Content-Type', 'application/octet-stream');
      xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded); };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try { resolve(JSON.parse(xhr.responseText)); } catch { reject(new Error('رد غير صالح من الـ Worker')); }
        } else if (xhr.status === 401 || xhr.status === 403) {
          reject(Object.assign(new Error('غير مصرّح — تأكد أن حسابك مشرف.'), { fatal: true }));
        } else {
          reject(new Error(`فشل رفع الجزء ${partNumber} (${xhr.status})`));
        }
      };
      xhr.onerror = () => reject(new Error(`انقطع الاتصال أثناء رفع الجزء ${partNumber}`));
      xhr.send(blob);
    }).catch(async (err) => {
      if (err.fatal || n >= PART_RETRIES) throw err;
      await new Promise((r) => setTimeout(r, 1500 * n));
      onProgress(0);
      return attempt(n + 1);
    });
  return attempt(1);
}

/**
 * رفع فيديو الدرس إلى R2 على أجزاء. يُرجع { size }.
 * onProgress(percent) من 0 إلى 100.
 */
export async function uploadLessonVideo(file, videoKey, onProgress = () => {}) {
  if (!R2_WORKER_URL) throw new Error('VITE_R2_WORKER_URL غير مضبوط في ملف .env');
  const { contentType } = inspectVideoFile(file);
  const { uploadId } = await workerJson('/media/upload/init', {
    method: 'POST',
    body: JSON.stringify({ key: videoKey, contentType }),
  });

  const totalParts = Math.max(1, Math.ceil(file.size / PART_SIZE));
  const parts = [];
  let doneBytes = 0;
  try {
    for (let i = 0; i < totalParts; i++) {
      const start = i * PART_SIZE;
      const blob = file.slice(start, Math.min(start + PART_SIZE, file.size));
      const token = await idToken(); // يتجدّد تلقائيًا إن انتهى أثناء رفع طويل
      const res = await putPart({
        key: videoKey,
        uploadId,
        partNumber: i + 1,
        blob,
        token,
        onProgress: (loaded) => onProgress(Math.min(99, Math.round(((doneBytes + loaded) / file.size) * 100))),
      });
      parts.push({ partNumber: res.partNumber, etag: res.etag });
      doneBytes += blob.size;
      onProgress(Math.min(99, Math.round((doneBytes / file.size) * 100)));
    }
    const done = await workerJson('/media/upload/complete', {
      method: 'POST',
      body: JSON.stringify({ key: videoKey, uploadId, parts }),
    });
    onProgress(100);
    return { size: done.size };
  } catch (err) {
    // تنظيف الأجزاء المرفوعة حتى لا تُحاسَب على تخزين غير مكتمل
    workerJson('/media/upload/abort', { method: 'POST', body: JSON.stringify({ key: videoKey, uploadId }) }).catch(() => {});
    throw err;
  }
}

/**
 * التقاط صورة مصغّرة من الفيديو في المتصفح (JPEG، عرض 640).
 * يُرجع Blob أو null إن تعذّر (مثلًا ترميز لا يشغّله المتصفح) — الرفع يستمر بدون صورة.
 */
export function captureThumbnail(file, { width = 640, at = 0.08 } = {}) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.src = url;
    let settled = false;
    const finish = (blob) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      resolve(blob || null);
    };
    const timer = setTimeout(() => finish(null), 15000);
    video.onerror = () => { clearTimeout(timer); finish(null); };
    video.onloadedmetadata = () => {
      const d = Number.isFinite(video.duration) ? video.duration : 0;
      video.currentTime = d ? Math.min(Math.max(d * at, 0.5), d - 0.1) : 0;
    };
    video.onseeked = () => {
      try {
        const scale = Math.min(1, width / (video.videoWidth || width));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round((video.videoWidth || width) * scale);
        canvas.height = Math.round((video.videoHeight || width * 9 / 16) * scale);
        canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => { clearTimeout(timer); finish(blob); }, 'image/jpeg', 0.82);
      } catch {
        clearTimeout(timer);
        finish(null);
      }
    };
  });
}

/** رفع الصورة المصغّرة (PUT عادي عبر الـ Worker). يُرجع رابطها العام. */
export async function uploadThumbnail(blob, thumbKey) {
  const token = await idToken();
  const res = await fetch(r2PublicUrl(thumbKey), {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'image/jpeg' },
    body: blob,
  });
  if (!res.ok) throw new Error(`فشل رفع الصورة المصغّرة (${res.status})`);
  return r2PublicUrl(thumbKey);
}

/**
 * يرفع الفيديو + الصورة المصغّرة ويعيد الحقول التي تُحفظ في مستند الدرس.
 * onStage('thumb' | 'video'), onProgress(percent)
 */
export async function uploadLessonMedia(file, { level, module }, { onStage = () => {}, onProgress = () => {} } = {}) {
  const { contentType, ext } = inspectVideoFile(file);
  const keys = lessonMediaKeys({ level, module, ext });

  onStage('thumb');
  const thumb = await captureThumbnail(file);
  let thumbnailURL = '';
  if (thumb) {
    try { thumbnailURL = await uploadThumbnail(thumb, keys.thumbKey); } catch { /* غير حرج */ }
  }

  onStage('video');
  const { size } = await uploadLessonVideo(file, keys.videoKey, onProgress);

  return {
    videoKey: keys.videoKey,
    videoType: contentType,
    videoSize: size,
    thumbKey: thumbnailURL ? keys.thumbKey : null,
    thumbnailURL: thumbnailURL || null,
    mediaFolder: keys.folder,
  };
}

/** حذف فيديو الدرس وصورته من R2 (بأفضل جهد — يستدعيه الحذف/الاستبدال). */
export async function deleteLessonMedia(lesson) {
  if (!lesson) return;
  const keys = [lesson.videoKey, lesson.thumbKey].filter(Boolean);
  await Promise.all(keys.map((k) => deleteFromR2(k).catch(() => {})));
}

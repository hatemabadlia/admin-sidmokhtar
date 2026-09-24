// src/lib/r2.js — رفع/حذف ملفات الامتحانات على Cloudflare R2 عبر الـ Worker
// (workers/r2-exams). لا مفاتيح R2 في المتصفح: الـ Worker يتحقق من أن
// المستخدم مشرف عبر Firebase ID token ثم يكتب في الحاوية.
import { auth } from '../firebase/config';

// رابط الـ Worker — يُضبط في .env (انظر .env.example)
export const R2_WORKER_URL = (import.meta.env.VITE_R2_WORKER_URL || '').replace(/\/+$/, '');

const encodeKey = (key) => key.split('/').map(encodeURIComponent).join('/');

/** الرابط العام للملف (يخدمه الـ Worker من R2). */
export const r2PublicUrl = (key) => `${R2_WORKER_URL}/${encodeKey(key)}`;

async function idToken() {
  const user = auth.currentUser;
  if (!user) throw new Error('يجب تسجيل الدخول أولًا.');
  return user.getIdToken();
}

/**
 * رفع ملف إلى R2 بمفتاح معيّن (مثال: exams/1as/math/1700000000000-ab12cd.pdf).
 * XHR بدل fetch حتى نعرض نسبة التقدّم. يُرجع الرابط العام للملف.
 */
export async function uploadToR2(file, key, onProgress = () => {}) {
  if (!R2_WORKER_URL) throw new Error('VITE_R2_WORKER_URL غير مضبوط في ملف .env');
  const token = await idToken();

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', r2PublicUrl(key));
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          resolve(data.url || r2PublicUrl(key));
        } catch {
          resolve(r2PublicUrl(key));
        }
      } else if (xhr.status === 401 || xhr.status === 403) {
        reject(new Error('غير مصرّح — تأكد أن حسابك مشرف.'));
      } else {
        reject(new Error(`فشل رفع الملف (${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error('فشل رفع الملف — تحقق من الاتصال ورابط الـ Worker'));
    xhr.send(file);
  });
}

/** حذف ملف من R2 (عند حذف امتحان). يرمي خطأ عند الفشل — المستدعي يقرر. */
export async function deleteFromR2(key) {
  if (!R2_WORKER_URL || !key) return;
  const token = await idToken();
  const res = await fetch(r2PublicUrl(key), {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`تعذّر حذف الملف من R2 (${res.status})`);
}

/** مفتاح فريد وآمن (بلا أحرف عربية/فراغات في المسار). */
export function examKey({ level, module, ext = 'pdf' }) {
  const rand = Math.random().toString(36).slice(2, 8);
  return `exams/${level}/${module}/${Date.now()}-${rand}.${ext}`;
}

/**
 * رابط قراءة موقّع (ساعة واحدة) لملف امتحان على R2 — ملفات PDF لا تُفتح مباشرة بعد الآن.
 * الـ Worker يتحقق من التوكن ويقرأ exams/{examId}.r2Key بنفسه.
 */
export async function getExamViewUrl(examId) {
  if (!R2_WORKER_URL) throw new Error('VITE_R2_WORKER_URL غير مضبوط في ملف .env');
  const token = await idToken();
  const res = await fetch(`${R2_WORKER_URL}/media/file-url`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ examId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `تعذّر تجهيز رابط الملف (${res.status})`);
  return data.url;
}

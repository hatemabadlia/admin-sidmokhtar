/**
 * Worker منصة المخ — يحمل الأسرار التي لا يجوز أن تصل إلى المتصفح.
 * كل الملفات (امتحانات PDF + فيديو الدروس + الصور المصغّرة) على R2 — بلا رسوم خروج بيانات.
 *
 *  R2 (ملفات الامتحانات PDF)
 *   GET    /exams/<key>?exp=&u=&sig=   يتطلب رابطًا موقّعًا (من /media/file-url) — لا يُفتح مباشرة
 *   PUT    /exams/<key>            مشرف (PDF فقط، ≤ 50MB)
 *   DELETE /exams/<key>            مشرف
 *
 *  R2 (فيديو الدروس)
 *   GET    /lessons/<id>/thumb.jpg             عام (الصورة المصغّرة)
 *   GET    /lessons/<id>/video.mp4?exp=&sig=   يتطلب رابطًا موقّعًا (من /media/play-url) — يدعم Range
 *   PUT    /lessons/<id>/thumb.jpg             مشرف (صورة فقط)
 *   DELETE /lessons/<key>                      مشرف
 *
 *  رفع الفيديو على أجزاء (Multipart) — لأن حدّ حجم الطلب في Workers هو 100MB (الخطة المجانية):
 *   POST   /media/upload/init      مشرف: {key, contentType} → {uploadId}
 *   PUT    /media/upload/part?key=&uploadId=&partNumber=   جسم الطلب = بايتات الجزء → {partNumber, etag}
 *   POST   /media/upload/complete  مشرف: {key, uploadId, parts:[{partNumber, etag}]}
 *   POST   /media/upload/abort     مشرف: {key, uploadId}
 *
 *  المشاهدة / القراءة
 *   POST   /media/play-url         طالب مسجّل: {lessonId} → رابط فيديو موقّع قصير العمر
 *                                  يُمنح فقط إذا كان القسم مفتوحًا في unlockedGroups (أو مشرف).
 *   POST   /media/file-url         طالب مسجّل: {examId} → رابط PDF موقّع قصير العمر (exams/{examId}.r2Key)
 *
 *  الروابط الموقّعة مربوطة بحساب الطالب (u=uid داخل التوقيع) وصالحة لساعة واحدة.
 *
 * الأسرار (wrangler secret put): MEDIA_SIGNING_KEY (أي نص عشوائي طويل — لتوقيع روابط المشاهدة)
 * التحقق من الهوية: Firebase ID token → نقرأ users/{uid} من Firestore REST بنفس التوكن
 * (Firestore يرفض التوكن المزوّر؛ القواعد تسمح للمستخدم بقراءة مستنده فقط).
 */

const LESSONS_PREFIX = 'lessons/';
const EXAMS_PREFIX = 'exams/';
// عمر الرابط الموقّع: ساعة واحدة (الواجهة تطلب رابطًا جديدًا تلقائيًا عند الانتهاء)
const SIGNED_URL_TTL_SECONDS = 3600;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    if (url.pathname.startsWith('/media/')) return handleMedia(request, env, url, cors);
    return handleR2(request, env, url, cors);
  },
};

/* ===================== R2: الملفات ===================== */

async function handleR2(request, env, url, cors) {
  const key = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
  if (!key) return json({ error: 'missing key' }, 400, cors);
  if (key.includes('..')) return json({ error: 'bad key' }, 400, cors);

  if (request.method === 'GET' || request.method === 'HEAD') {
    if (!isAllowedReader(request, env)) return json({ error: 'read from the platform only' }, 403, cors);

    // فيديو الدروس + ملفات الامتحانات: لا تُقرأ إلا برابط موقّع (exp + u + sig)
    // من /media/play-url أو /media/file-url — الصور المصغّرة فقط عامة.
    if (isLessonVideoKey(key) || isExamKey(key)) {
      const check = await verifySignedUrl(env, key, url);
      if (!check.ok) return json({ error: check.error }, check.status, cors);
      return serveObject(request, env, key, cors, {
        cacheControl: 'private, max-age=3600',
        defaultType: isExamKey(key) ? 'application/pdf' : undefined,
      });
    }
    return serveObject(request, env, key, cors, {
      cacheControl: 'public, max-age=31536000, immutable',
    });
  }

  if (request.method === 'PUT' || request.method === 'DELETE') {
    const gate = await requireAdmin(request, env);
    if (!gate.ok) return json({ error: gate.error }, gate.status, cors);
    if (!isAllowedPrefix(key, env)) return json({ error: 'prefix not allowed' }, 403, cors);

    if (request.method === 'PUT') {
      const contentType = request.headers.get('content-type') || 'application/octet-stream';
      // الامتحانات: PDF فقط. الدروس: الصورة المصغّرة فقط (الفيديو يُرفع عبر /media/upload/*).
      const okType = key.startsWith(LESSONS_PREFIX)
        ? /^image\/(jpeg|png|webp)/i.test(contentType)
        : /^application\/pdf/i.test(contentType);
      if (!okType) return json({ error: key.startsWith(LESSONS_PREFIX) ? 'image only' : 'pdf only' }, 415, cors);
      const body = await request.arrayBuffer();
      if (body.byteLength === 0) return json({ error: 'empty body' }, 400, cors);
      if (body.byteLength > 50 * 1024 * 1024) return json({ error: 'file too large (max 50MB)' }, 413, cors);
      await env.BUCKET.put(key, body, { httpMetadata: { contentType } });
      return json({ ok: true, key, url: `${url.origin}/${encodeKey(key)}`, size: body.byteLength }, 200, cors);
    }
    await env.BUCKET.delete(key);
    return json({ ok: true, key }, 200, cors);
  }
  return json({ error: 'method not allowed' }, 405, cors);
}

/** يخدم كائنًا من R2 مع دعم Range (ضروري للتقديم/الترجيع في مشغّل الفيديو). */
async function serveObject(request, env, key, cors, { cacheControl, defaultType }) {
  const rangeHeader = request.headers.get('range');
  let obj;
  try {
    obj = await env.BUCKET.get(key, rangeHeader ? { range: request.headers } : undefined);
  } catch {
    // Range خارج حدود الملف
    return new Response(null, { status: 416, headers: { ...cors, 'content-range': 'bytes */0' } });
  }
  if (!obj) return json({ error: 'not found' }, 404, cors);

  const headers = new Headers(cors);
  obj.writeHttpMetadata(headers);
  headers.set('etag', obj.httpEtag);
  headers.set('accept-ranges', 'bytes');
  headers.set('cache-control', cacheControl);
  if (!headers.get('content-type') && defaultType) headers.set('content-type', defaultType);
  headers.set('content-disposition', `inline; filename="${key.split('/').pop()}"`);

  let status = 200;
  if (obj.range) {
    const size = obj.size;
    let start;
    let end;
    if ('suffix' in obj.range) {
      start = size - obj.range.suffix;
      end = size - 1;
    } else {
      start = obj.range.offset ?? 0;
      end = obj.range.length != null ? start + obj.range.length - 1 : size - 1;
    }
    headers.set('content-range', `bytes ${start}-${end}/${size}`);
    headers.set('content-length', String(end - start + 1));
    status = 206;
  } else {
    headers.set('content-length', String(obj.size));
  }
  return new Response(request.method === 'HEAD' ? null : obj.body, { status, headers });
}

/* ===================== الوسائط: رفع الفيديو + روابط المشاهدة ===================== */

async function handleMedia(request, env, url, cors) {
  // --- رابط مشاهدة موقّع للطالب
  if (url.pathname === '/media/play-url' && request.method === 'POST') {
    if (!env.MEDIA_SIGNING_KEY) return json({ error: 'MEDIA_SIGNING_KEY secret not set' }, 500, cors);
    const who = await authUser(request, env);
    if (!who.ok) return json({ error: who.error }, who.status, cors);

    const body = await request.json().catch(() => ({}));
    const lessonId = String(body.lessonId || '').trim();
    if (!lessonId || lessonId.includes('/')) return json({ error: 'lessonId required' }, 400, cors);

    const lesson = await fsGet(env, `lessons/${lessonId}`, who.token);
    if (!lesson) return json({ error: 'lesson not found' }, 404, cors);
    const videoKey = String(lesson.videoKey || '');
    if (!isLessonVideoKey(videoKey)) return json({ error: 'lesson has no video' }, 404, cors);

    const isAdmin = who.user.role === 'admin';
    const unlocked = Array.isArray(who.user.unlockedGroups) ? who.user.unlockedGroups : [];
    const keys = lessonKeys(lesson);
    if (!isAdmin && !keys.some((k) => unlocked.includes(k))) {
      return json({ error: 'locked', keys }, 403, cors);
    }

    const signed = await signedUrl(env, url.origin, videoKey, who.uid);
    return json({ ok: true, ...signed, videoType: lesson.videoType || 'video/mp4' }, 200, cors);
  }

  // --- رابط قراءة موقّع لملف امتحان (أي طالب مسجّل — الامتحانات ليست خلف رموز)
  if (url.pathname === '/media/file-url' && request.method === 'POST') {
    if (!env.MEDIA_SIGNING_KEY) return json({ error: 'MEDIA_SIGNING_KEY secret not set' }, 500, cors);
    const who = await authUser(request, env);
    if (!who.ok) return json({ error: who.error }, who.status, cors);

    const body = await request.json().catch(() => ({}));
    const examId = String(body.examId || '').trim();
    if (!examId || examId.includes('/')) return json({ error: 'examId required' }, 400, cors);

    const exam = await fsGet(env, `exams/${examId}`, who.token);
    if (!exam) return json({ error: 'exam not found' }, 404, cors);
    const fileKey = String(exam.r2Key || '');
    if (!isExamKey(fileKey)) return json({ error: 'exam has no file' }, 404, cors);

    const signed = await signedUrl(env, url.origin, fileKey, who.uid);
    return json({ ok: true, ...signed }, 200, cors);
  }

  // --- رفع الفيديو على أجزاء (مشرف)
  if (url.pathname.startsWith('/media/upload/')) {
    const gate = await requireAdmin(request, env);
    if (!gate.ok) return json({ error: gate.error }, gate.status, cors);

    if (url.pathname === '/media/upload/init' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const key = String(body.key || '');
      const contentType = String(body.contentType || 'video/mp4');
      if (!isLessonVideoKey(key)) return json({ error: 'bad key' }, 400, cors);
      if (!/^video\/(mp4|webm)$/i.test(contentType)) return json({ error: 'video/mp4 or video/webm only' }, 415, cors);
      const mp = await env.BUCKET.createMultipartUpload(key, { httpMetadata: { contentType } });
      return json({ ok: true, key, uploadId: mp.uploadId }, 200, cors);
    }

    if (url.pathname === '/media/upload/part' && request.method === 'PUT') {
      const key = String(url.searchParams.get('key') || '');
      const uploadId = String(url.searchParams.get('uploadId') || '');
      const partNumber = Number(url.searchParams.get('partNumber') || 0);
      if (!isLessonVideoKey(key) || !uploadId || !Number.isInteger(partNumber) || partNumber < 1 || partNumber > 10000) {
        return json({ error: 'bad params' }, 400, cors);
      }
      const bytes = await request.arrayBuffer();
      if (bytes.byteLength === 0) return json({ error: 'empty part' }, 400, cors);
      const mp = env.BUCKET.resumeMultipartUpload(key, uploadId);
      try {
        const part = await mp.uploadPart(partNumber, bytes);
        return json({ ok: true, partNumber: part.partNumber, etag: part.etag }, 200, cors);
      } catch (e) {
        return json({ error: `upload part failed: ${e.message || e}` }, 500, cors);
      }
    }

    if (url.pathname === '/media/upload/complete' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const key = String(body.key || '');
      const uploadId = String(body.uploadId || '');
      const parts = Array.isArray(body.parts) ? body.parts : [];
      if (!isLessonVideoKey(key) || !uploadId || parts.length === 0) return json({ error: 'bad params' }, 400, cors);
      const mp = env.BUCKET.resumeMultipartUpload(key, uploadId);
      try {
        const obj = await mp.complete(parts.map((p) => ({ partNumber: Number(p.partNumber), etag: String(p.etag) })));
        return json({ ok: true, key, size: obj.size, url: `${url.origin}/${encodeKey(key)}` }, 200, cors);
      } catch (e) {
        return json({ error: `complete failed: ${e.message || e}` }, 500, cors);
      }
    }

    if (url.pathname === '/media/upload/abort' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const key = String(body.key || '');
      const uploadId = String(body.uploadId || '');
      if (!isLessonVideoKey(key) || !uploadId) return json({ error: 'bad params' }, 400, cors);
      try { await env.BUCKET.resumeMultipartUpload(key, uploadId).abort(); } catch { /* قد يكون مكتملًا/محذوفًا */ }
      return json({ ok: true }, 200, cors);
    }
  }

  return json({ error: 'not found' }, 404, cors);
}

/** مفتاح فيديو درس: lessons/<...>/video.(mp4|webm) */
function isLessonVideoKey(key) {
  return /^lessons\/[A-Za-z0-9_\-./]+\/video\.(mp4|webm)$/.test(key) && !key.includes('..');
}

/** مفتاح ملف امتحان: exams/<level>/<module>/<file>.pdf */
function isExamKey(key) {
  return key.startsWith(EXAMS_PREFIX) && /^exams\/[A-Za-z0-9_\-./]+\.pdf$/i.test(key) && !key.includes('..');
}

/** مفاتيح الفتح التي تكفي لمشاهدة الدرس: مفتاح المجموعة + مفتاح «المادة كاملة». */
function lessonKeys(lesson) {
  const level = String(lesson.level || '');
  const module = String(lesson.module || '');
  if (!level || !module) return [];
  const group = level === 'bac' ? String(lesson.unit || '').trim() : String(lesson.trimester || '');
  const keys = [`${level}_${module}`];
  if (group) keys.push(`${level}_${module}_${group}`);
  return keys;
}

/* ===================== توقيع روابط المشاهدة (HMAC-SHA256) ===================== */

async function hmacKey(env) {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(String(env.MEDIA_SIGNING_KEY)),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
}

/** التوقيع يشمل المفتاح + حساب الطالب + الانتهاء — فلا يُعاد استعمال رابط بحساب آخر. */
async function signKey(env, key, uid, expires) {
  const k = await hmacKey(env);
  const sig = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(`${key}\n${uid}\n${expires}`));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** يبني رابطًا موقّعًا قصير العمر لمفتاح R2 لحساب معيّن. */
async function signedUrl(env, origin, key, uid) {
  const expires = Math.floor(Date.now() / 1000) + SIGNED_URL_TTL_SECONDS;
  const sig = await signKey(env, key, uid, expires);
  return {
    url: `${origin}/${encodeKey(key)}?exp=${expires}&u=${encodeURIComponent(uid)}&sig=${sig}`,
    expires,
  };
}

async function verifySignedUrl(env, key, url) {
  if (!env.MEDIA_SIGNING_KEY) return { ok: false, status: 500, error: 'MEDIA_SIGNING_KEY secret not set' };
  const exp = Number(url.searchParams.get('exp') || 0);
  const uid = String(url.searchParams.get('u') || '');
  const sig = String(url.searchParams.get('sig') || '');
  if (!exp || !uid || !sig) return { ok: false, status: 401, error: 'signed url required' };
  if (exp < Math.floor(Date.now() / 1000)) return { ok: false, status: 403, error: 'link expired' };
  const expected = await signKey(env, key, uid, exp);
  if (!timingSafeEqual(expected, sig)) return { ok: false, status: 403, error: 'bad signature' };
  return { ok: true };
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* ===================== المصادقة عبر Firestore ===================== */

/** يقرأ uid من حمولة JWT دون تحقق توقيع — التحقق الحقيقي يقوم به Firestore أدناه. */
function decodeJwtPayload(token) {
  try {
    const part = token.split('.')[1];
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=');
    return JSON.parse(atob(b64));
  } catch {
    return null;
  }
}

/** مستخدم مسجّل: يُرجع { uid, token, user: بيانات users/{uid} } */
async function authUser(request, env) {
  const auth = request.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) return { ok: false, status: 401, error: 'missing token' };

  const payload = decodeJwtPayload(token);
  const uid = payload?.sub || payload?.user_id;
  if (!uid || payload.aud !== env.FIREBASE_PROJECT_ID) return { ok: false, status: 401, error: 'invalid token' };

  // Firestore يرفض التوكن المزوّر/المنتهي (401) وقراءة مستند غير المستخدم (403).
  const user = await fsGet(env, `users/${uid}`, token, true);
  if (user === null) return { ok: false, status: 401, error: 'auth check failed' };
  return { ok: true, uid, token, user };
}

async function requireAdmin(request, env) {
  const who = await authUser(request, env);
  if (!who.ok) return who;
  if (who.user.role !== 'admin') return { ok: false, status: 403, error: 'admin only' };
  return who;
}

/** قراءة مستند من Firestore REST بتوكن المستخدم؛ يُرجع الحقول كقيم JS أو null. */
async function fsGet(env, path, token, allowMissing = false) {
  const res = await fetch(
    `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/${path}`,
    { headers: { authorization: `Bearer ${token}` } }
  );
  if (res.status === 404) return allowMissing ? {} : null;
  if (!res.ok) return null;
  const doc = await res.json();
  return fromFields(doc.fields || {});
}

/** تحويل صيغة Firestore REST (stringValue…) إلى قيم عادية. */
function fromFields(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields)) out[k] = fromValue(v);
  return out;
}
function fromValue(v) {
  if (!v || typeof v !== 'object') return v;
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromValue);
  if ('mapValue' in v) return fromFields(v.mapValue.fields || {});
  return null;
}

/* ===================== أدوات ===================== */

function isAllowedPrefix(key, env) {
  const prefixes = String(env.ALLOWED_PREFIXES || 'exams/').split(',').map((p) => p.trim()).filter(Boolean);
  return prefixes.some((p) => key.startsWith(p));
}

/**
 * READ_ORIGINS (اختياري): أصول الموقع المسموح لها بقراءة ملفات R2.
 * فارغ أو "*" → مفتوح. وإلا يجب أن يأتي الطلب بـ Origin أو Referer من الموقع.
 */
function isAllowedReader(request, env) {
  const raw = String(env.READ_ORIGINS || '').trim();
  if (!raw || raw === '*') return true;
  const allowed = raw.split(',').map((o) => o.trim().replace(/\/+$/, '')).filter(Boolean);
  const origin = request.headers.get('origin') || '';
  const referer = request.headers.get('referer') || '';
  return allowed.some((o) => origin === o || referer.startsWith(o + '/'));
}

function encodeKey(key) {
  return key.split('/').map(encodeURIComponent).join('/');
}

function corsHeaders(request, env) {
  const allowed = String(env.ALLOWED_ORIGINS || '*').split(',').map((o) => o.trim());
  const origin = request.headers.get('origin') || '';
  const allow = allowed.includes('*') ? '*' : allowed.includes(origin) ? origin : allowed[0] || '*';
  return {
    'access-control-allow-origin': allow,
    'access-control-allow-methods': 'GET, HEAD, POST, PUT, DELETE, OPTIONS',
    'access-control-allow-headers': 'authorization, content-type, range',
    'access-control-expose-headers': 'content-range, content-length, accept-ranges, etag',
    'access-control-max-age': '86400',
    vary: 'origin',
  };
}

function json(data, status, cors) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

# Worker: ملفات المنصة على Cloudflare R2

يستبدل Firebase Storage (للامتحانات) وBunny Stream (لفيديو الدروس) — كل شيء على R2 بلا رسوم خروج بيانات.
Firestore يبقى للبيانات الوصفية فقط.

## الإعداد (مرة واحدة)

```bash
cd workers/r2-exams
npx wrangler login
npx wrangler r2 bucket create sidmokhtar-exams
# مفتاح توقيع روابط المشاهدة (نص عشوائي — لا يُشارك مع أحد)
openssl rand -hex 32 | npx wrangler secret put MEDIA_SIGNING_KEY
npx wrangler deploy
# يطبع رابطًا مثل: https://sidmokhtar-r2-exams.<account>.workers.dev
```

ثم في لوحة التحكم (`admin-panel-sidmokhtar/.env`):

```
VITE_R2_WORKER_URL=https://sidmokhtar-r2-exams.<account>.workers.dev
```

بعد النشر النهائي ضع نطاق لوحة التحكم في `ALLOWED_ORIGINS` داخل `wrangler.toml` بدل `*`.

## كيف يعمل

| الطلب | من | التحقق |
|---|---|---|
| `POST /media/file-url` | الطالب | مسجّل → رابط PDF موقّع (مربوط بحسابه) صالح ساعة |
| `GET /exams/...pdf?exp=&u=&sig=` | قارئ PDF | توقيع HMAC صحيح وغير منتهٍ — لا يُفتح الملف مباشرة |
| `PUT /exams/...pdf` | لوحة التحكم | Firebase ID token → `users/{uid}.role == 'admin'` |
| `POST /media/upload/init` + `PUT /media/upload/part` + `POST /media/upload/complete` | لوحة التحكم | مشرف — رفع الفيديو على أجزاء 32MB (حدّ الطلب في Workers 100MB) |
| `PUT /lessons/<id>/thumb.jpg` | لوحة التحكم | مشرف — الصورة المصغّرة (تُلتقط من الفيديو في المتصفح) |
| `POST /media/play-url` | الطالب | مسجّل + القسم مفتوح في `unlockedGroups` → رابط موقّع (مربوط بحسابه) صالح ساعة |
| `GET /lessons/<id>/video.mp4?exp=&u=&sig=` | مشغّل الفيديو | توقيع HMAC صحيح وغير منتهٍ — يدعم Range للتقديم |
| `DELETE /exams/...` أو `/lessons/...` | لوحة التحكم | مشرف |

## الفيديو

R2 لا يعالج الفيديو (لا تحويل جودة تلقائي). ارفع MP4 جاهزًا (H.264 + AAC، 720p ≈ 1.5 Mbps).
لضغط فيديو قبل الرفع:

```bash
ffmpeg -i input.mov -c:v libx264 -preset slow -crf 24 -vf "scale=-2:720" -c:a aac -b:a 96k -movflags +faststart lesson.mp4
```

`-movflags +faststart` مهم: يضع فهرس الملف في البداية حتى يبدأ التشغيل قبل اكتمال التحميل.

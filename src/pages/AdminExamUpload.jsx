// src/pages/AdminExamUpload.jsx
import React, { useState } from 'react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { uploadToR2, examKey } from '../lib/r2';
import AdminLayout from '../components/AdminLayout';

const LEVELS = [
  { value: '4am', label: 'الرابعة متوسط (BEM)' },
  { value: '1as', label: 'الأولى ثانوي' },
  { value: '2as', label: 'الثانية ثانوي' },
  { value: 'bac', label: 'البكالوريا (الثالثة ثانوي)' },
];

const MODULES = [
  { value: 'math', label: 'رياضيات' },
  { value: 'physics', label: 'فيزياء' },
];

const TRIMESTERS = [
  { value: 't1', label: 'الفصل الأول' },
  { value: 't2', label: 'الفصل الثاني' },
  { value: 't3', label: 'الفصل الثالث' },
];

const EXAM_TYPES = [
  { value: 'exam', label: 'اختبار' },
  { value: 'quiz', label: 'فرض' },
];

export default function AdminExamUpload() {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [level, setLevel] = useState('');
  const [module, setModule] = useState('');
  const [trimester, setTrimester] = useState('');
  const [unit, setUnit] = useState('');
  const [type, setType] = useState('exam');
  const [pdfFile, setPdfFile] = useState(null);
  const [pdfProgress, setPdfProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const isBac = level === 'bac';

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setLevel('');
    setModule('');
    setTrimester('');
    setUnit('');
    setPdfFile(null);
    setPdfProgress(0);
  };

  const validate = () => {
    if (!title.trim()) return 'أدخل عنوان الاختبار.';
    if (!pdfFile) return 'اختر ملف PDF.';
    if (pdfFile.type !== 'application/pdf') return 'يجب اختيار ملف بصيغة PDF.';
    if (!level) return 'اختر المستوى الدراسي.';
    if (!module) return 'اختر المادة (رياضيات أو فيزياء).';
    if (isBac && !unit.trim()) return 'أدخل الوحدة.';
    if (!isBac && !trimester) return 'اختر الفصل الدراسي.';
    return '';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setUploading(true);
    try {
      // الملف يُرفع إلى Cloudflare R2 (بلا رسوم خروج) — Firestore للبيانات الوصفية فقط
      const r2Key = examKey({ level, module });
      const pdfURL = await uploadToR2(pdfFile, r2Key, setPdfProgress);

      await addDoc(collection(db, 'exams'), {
        title: title.trim(),
        description: description.trim(),
        level,
        module,
        type,
        trimester: isBac ? null : trimester,
        unit: isBac ? unit.trim() : null,
        pdfURL,
        storage: 'r2',
        r2Key,
        fileName: pdfFile.name,
        fileSize: pdfFile.size,
        createdAt: serverTimestamp(),
      });

      setSuccess('تم رفع الامتحان بنجاح ✅ — يمكنك تعديله أو حذفه من «إدارة الامتحانات».');
      resetForm();
    } catch (err) {
      console.error('Exam upload failed:', err);
      setError(err?.message || 'حدث خطأ أثناء الرفع، حاول مجددًا.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <AdminLayout title="رفع اختبار (PDF)" subtitle="إضافة اختبارات وفروض جديدة بصيغة PDF">
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link
        href="https://fonts.googleapis.com/css2?family=Aref+Ruqaa:wght@700&family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700&display=swap"
        rel="stylesheet"
      />
      <style>{`
      :root{
        --ink-teal:#0E3B36; --ink-teal-deep:#092824;
        --parchment:#F6EEDC; --parchment-dim:#EFE3C8;
        --gold:#E3A23C; --gold-bright:#F0B85C;
        --crimson:#B23A2E;
        --text-dark:#1C1A15; --line:rgba(28,26,21,0.14);
      }
      *{margin:0;padding:0;box-sizing:border-box;}
      body{background:var(--parchment-dim);}

      .topbar{
        display:flex;align-items:center;justify-content:space-between;
        background:var(--ink-teal);color:var(--parchment);padding:18px 32px;
      }
      .topbar-brand{display:flex;align-items:center;gap:10px;}
      .logo-mark{
        width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;
        background:var(--gold);color:var(--ink-teal-deep);
        font-family:'Aref Ruqaa',serif;font-size:17px;font-weight:700;
      }
      .topbar-brand span{font-family:'Aref Ruqaa',serif;font-size:19px;}
      .topbar-right{display:flex;align-items:center;gap:14px;flex-wrap:wrap;justify-content:flex-end;}
      .nav-link{
        color:rgba(246,238,220,0.75);font-size:13.5px;font-weight:600;cursor:pointer;
        padding:8px 14px;border-radius:8px;transition:all .2s;text-decoration:none;background:none;border:0;
      }
      .nav-link:hover, .nav-link.active{color:var(--parchment);background:rgba(246,238,220,0.1);}
      .logout-btn{
        border:1.5px solid rgba(246,238,220,0.35);background:transparent;color:var(--parchment);
        padding:9px 18px;border-radius:999px;cursor:pointer;font-family:inherit;font-weight:600;font-size:13.5px;
        transition:all .2s;
      }
      .logout-btn:hover{background:rgba(246,238,220,0.1);border-color:var(--gold);}

      .body{padding:32px;max-width:720px;margin:0 auto;}
      .title-head{font-family:'Aref Ruqaa',serif;font-size:26px;color:var(--ink-teal);margin-bottom:24px;}

      .form-panel{background:#fffdf6;border:1px solid var(--line);border-radius:16px;padding:28px;}

      .field{margin-bottom:20px;}
      .field label{display:block;font-size:13.5px;font-weight:600;margin-bottom:8px;color:var(--text-dark);}
      .text-input, .select-input, textarea{
        width:100%;background:#fffdf6;border:1.5px solid var(--line);border-radius:10px;
        padding:12px 14px;font-family:inherit;font-size:14px;outline:0;transition:border-color .2s;
      }
      .text-input:focus, .select-input:focus, textarea:focus{border-color:var(--gold);}
      textarea{resize:vertical;min-height:80px;}
      .select-input{cursor:pointer;}

      .grid-2{display:grid;grid-template-columns:1fr 1fr;gap:16px;}
      @media (max-width:600px){.grid-2{grid-template-columns:1fr;}}

      .file-drop{
        border:1.5px dashed var(--line);border-radius:12px;padding:20px;text-align:center;
        cursor:pointer;transition:border-color .2s;background:var(--parchment-dim);
      }
      .file-drop:hover{border-color:var(--gold);}
      .file-drop input{display:none;}
      .file-name{font-size:12.5px;color:var(--ink-teal);margin-top:8px;font-weight:600;}

      .progress-wrap{margin-top:10px;background:var(--line);border-radius:999px;height:6px;overflow:hidden;}
      .progress-bar{height:100%;background:var(--gold);transition:width .2s;}
      .progress-label{font-size:11.5px;color:#5c584c;margin-top:4px;}

      .btn-primary{
        width:100%;border:0;cursor:pointer;
        background:var(--ink-teal);color:var(--parchment);font-weight:700;font-size:16px;
        font-family:inherit;padding:15px 0;border-radius:12px;
        transition:all .25s;box-shadow:0 8px 24px rgba(14,59,54,0.28);margin-top:8px;
      }
      .btn-primary:hover{background:var(--ink-teal-deep);}
      .btn-primary:disabled{opacity:0.6;cursor:not-allowed;}

      .message{border-radius:12px;padding:12px 16px;font-size:13.5px;margin-bottom:18px;line-height:1.6;text-align:right;}
      .message.error{background:rgba(178,58,46,0.08);border:1px solid rgba(178,58,46,0.3);color:#8c2a20;}
      .message.success{background:rgba(46,139,87,0.1);border:1px solid rgba(46,139,87,0.3);color:#1f6b41;}
      `}</style>

      <main className="body">
        <h1 className="title-head">رفع اختبار جديد (PDF)</h1>

        {error && <div className="message error">{error}</div>}
        {success && <div className="message success">{success}</div>}

        <form className="form-panel" onSubmit={handleSubmit}>
          <div className="field">
            <label>عنوان الاختبار</label>
            <input
              className="text-input"
              type="text"
              placeholder="مثال: اختبار الفصل الأول في الرياضيات"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="field">
            <label>الوصف (اختياري)</label>
            <textarea
              placeholder="وصف مختصر للاختبار..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="grid-2">
            <div className="field">
              <label>نوع الاختبار</label>
              <select className="select-input" value={type} onChange={(e) => setType(e.target.value)}>
                {EXAM_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>

            <div className="field">
              <label>المستوى الدراسي</label>
              <select className="select-input" value={level} onChange={(e) => { setLevel(e.target.value); setTrimester(''); setUnit(''); }}>
                <option value="">اختر المستوى</option>
                {LEVELS.map((l) => (
                  <option key={l.value} value={l.value}>{l.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="field">
            <label>المادة</label>
            <select className="select-input" value={module} onChange={(e) => setModule(e.target.value)}>
              <option value="">اختر المادة</option>
              {MODULES.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

          {level && (
            <div className="field">
              {isBac ? (
                <>
                  <label>الوحدة</label>
                  <input
                    className="text-input"
                    type="text"
                    placeholder="مثال: الوحدة الثالثة"
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                  />
                </>
              ) : (
                <>
                  <label>الفصل الدراسي</label>
                  <select className="select-input" value={trimester} onChange={(e) => setTrimester(e.target.value)}>
                    <option value="">اختر الفصل</option>
                    {TRIMESTERS.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </>
              )}
            </div>
          )}

          <div className="field">
            <label>ملف الاختبار (PDF)</label>
            <label className="file-drop">
              <input type="file" accept="application/pdf" onChange={(e) => { setPdfFile(e.target.files?.[0] || null); setPdfProgress(0); }} />
              📄 اضغط لاختيار ملف PDF
              {pdfFile && <div className="file-name">{pdfFile.name}</div>}
            </label>
            {uploading && pdfProgress > 0 && (
              <>
                <div className="progress-wrap"><div className="progress-bar" style={{ width: `${pdfProgress}%` }} /></div>
                <div className="progress-label">{pdfProgress}%</div>
              </>
            )}
          </div>

          <button className="btn-primary" type="submit" disabled={uploading}>
            {uploading ? 'جارٍ الرفع...' : 'رفع الاختبار'}
          </button>
        </form>
      </main>
    </AdminLayout>
  );
}
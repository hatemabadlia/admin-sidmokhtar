// src/pages/AdminQuizzes.jsx — الاختبارات التفاعلية (أسئلة اختيار من متعدد بتصحيح فوري)
// المجموعة: quizzes/{id} = { title, description, level, module, trimester|unit, published,
//   questions: [{ text, options: [4], correct: 0..3, explanation }], createdAt, updatedAt }
import React, { useEffect, useState } from 'react';
import {
  collection, getDocs, query, orderBy, addDoc, updateDoc, deleteDoc, doc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import AdminLayout from '../components/AdminLayout';
import { LEVELS, MODULES, levelLabel, moduleLabel, fmtDate } from '../lib/access';

const TRIMESTERS = [
  { value: 't1', label: 'الفصل الأول' },
  { value: 't2', label: 'الفصل الثاني' },
  { value: 't3', label: 'الفصل الثالث' },
];
const TRI_LABEL = Object.fromEntries(TRIMESTERS.map((t) => [t.value, t.label]));

const emptyQuestion = () => ({ text: '', options: ['', '', '', ''], correct: 0, explanation: '' });
const emptyForm = () => ({
  title: '', description: '', level: '', module: '', trimester: '', unit: '', published: true,
  questions: [emptyQuestion()],
});

const scopeLabel = (q) =>
  `${levelLabel(q.level)} · ${moduleLabel(q.module)}${q.level === 'bac' ? (q.unit ? ` · ${q.unit}` : '') : (q.trimester ? ` · ${TRI_LABEL[q.trimester] || q.trimester}` : '')}`;

export default function AdminQuizzes() {
  const [quizzes, setQuizzes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [editing, setEditing] = useState(null); // null | 'new' | quizId
  const [form, setForm] = useState(emptyForm());
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(null);

  const isBac = form.level === 'bac';

  const load = async () => {
    setLoading(true); setError('');
    try {
      const snap = await getDocs(query(collection(db, 'quizzes'), orderBy('createdAt', 'desc')));
      setQuizzes(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e); setError('تعذّر تحميل الاختبارات.');
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const startNew = () => { setForm(emptyForm()); setEditing('new'); setSuccess(''); setError(''); };
  const startEdit = (q) => {
    setForm({
      title: q.title || '', description: q.description || '', level: q.level || '', module: q.module || '',
      trimester: q.trimester || '', unit: q.unit || '', published: q.published !== false,
      questions: (q.questions || []).map((x) => ({
        text: x.text || '', options: [...(x.options || []), '', '', '', ''].slice(0, 4),
        correct: Number(x.correct) || 0, explanation: x.explanation || '',
      })),
    });
    setEditing(q.id); setSuccess(''); setError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setQ = (i, patch) =>
    setForm((f) => ({ ...f, questions: f.questions.map((q, j) => (j === i ? { ...q, ...patch } : q)) }));
  const setOpt = (i, k, v) =>
    setForm((f) => ({
      ...f,
      questions: f.questions.map((q, j) =>
        j === i ? { ...q, options: q.options.map((o, m) => (m === k ? v : o)) } : q),
    }));
  const addQ = () => setForm((f) => ({ ...f, questions: [...f.questions, emptyQuestion()] }));
  const removeQ = (i) => setForm((f) => ({ ...f, questions: f.questions.filter((_, j) => j !== i) }));
  const moveQ = (i, dir) =>
    setForm((f) => {
      const arr = [...f.questions];
      const j = i + dir;
      if (j < 0 || j >= arr.length) return f;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      return { ...f, questions: arr };
    });

  const validate = () => {
    if (!form.title.trim()) return 'أدخل عنوان الاختبار.';
    if (!form.level) return 'اختر المستوى.';
    if (!form.module) return 'اختر المادة.';
    if (isBac && !form.unit.trim()) return 'أدخل الوحدة.';
    if (!isBac && !form.trimester) return 'اختر الفصل.';
    if (form.questions.length === 0) return 'أضف سؤالًا واحدًا على الأقل.';
    for (let i = 0; i < form.questions.length; i++) {
      const q = form.questions[i];
      if (!q.text.trim()) return `السؤال ${i + 1}: أدخل نص السؤال.`;
      const filled = q.options.filter((o) => o.trim());
      if (filled.length < 2) return `السؤال ${i + 1}: أدخل خيارين على الأقل.`;
      if (!q.options[q.correct]?.trim()) return `السؤال ${i + 1}: الإجابة الصحيحة تشير إلى خيار فارغ.`;
    }
    return '';
  };

  const save = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');
    const v = validate();
    if (v) { setError(v); return; }
    setBusy(true);
    const payload = {
      title: form.title.trim(),
      description: form.description.trim(),
      level: form.level,
      module: form.module,
      trimester: isBac ? null : form.trimester,
      unit: isBac ? form.unit.trim() : null,
      published: !!form.published,
      questions: form.questions.map((q) => ({
        text: q.text.trim(),
        options: q.options.map((o) => o.trim()).filter(Boolean),
        // إعادة حساب فهرس الصحيح بعد حذف الخيارات الفارغة
        correct: q.options.slice(0, q.correct).filter((o) => o.trim()).length,
        explanation: q.explanation.trim(),
      })),
      updatedAt: serverTimestamp(),
    };
    try {
      if (editing === 'new') {
        await addDoc(collection(db, 'quizzes'), { ...payload, createdAt: serverTimestamp() });
        setSuccess('تم إنشاء الاختبار ✅');
      } else {
        await updateDoc(doc(db, 'quizzes', editing), payload);
        setSuccess('تم حفظ التعديلات ✅');
      }
      setEditing(null);
      setForm(emptyForm());
      load();
    } catch (err) {
      console.error(err); setError('تعذّر الحفظ — حاول مجددًا.');
    } finally { setBusy(false); }
  };

  const togglePublished = async (q) => {
    try { await updateDoc(doc(db, 'quizzes', q.id), { published: q.published === false }); load(); }
    catch (err) { console.error(err); }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    try { await deleteDoc(doc(db, 'quizzes', deleting.id)); setDeleting(null); load(); }
    catch (err) { console.error(err); setError('تعذّر الحذف.'); }
    finally { setBusy(false); }
  };

  return (
    <AdminLayout title="الاختبارات التفاعلية" subtitle="أسئلة اختيار من متعدد مع تصحيح فوري للطالب">
      <style>{`
        .qz-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:18px;}
        .qz-count{font-size:13px;color:var(--muted);}
        .btn{border:0;border-radius:10px;padding:10px 18px;cursor:pointer;font-family:inherit;font-weight:700;font-size:13px;transition:all .2s;}
        .btn-ok{background:var(--ink-teal);color:var(--parchment);}
        .btn-ok:hover{background:var(--ink-teal-deep);}
        .btn-gold{background:var(--gold);color:var(--ink-teal-deep);}
        .btn-ghost{background:var(--parchment-dim);color:var(--text-dark);}
        .btn-no{background:transparent;border:1.5px solid rgba(178,58,46,.4);color:#8c2a20;}
        .btn:disabled{opacity:.6;cursor:not-allowed;}
        .btn-sm{padding:7px 12px;font-size:12px;}
        .msg{border-radius:12px;padding:12px 16px;font-size:13.5px;margin-bottom:16px;}
        .msg.error{background:rgba(178,58,46,.08);border:1px solid rgba(178,58,46,.3);color:#8c2a20;}
        .msg.success{background:rgba(46,139,87,.1);border:1px solid rgba(46,139,87,.3);color:#1f6b41;}
        .panel{background:#fffdf8;border:1px solid var(--line);border-radius:16px;padding:22px;margin-bottom:20px;}
        .field{margin-bottom:14px;}
        .field label{display:block;font-size:12.5px;font-weight:700;margin-bottom:6px;color:var(--text-dark);}
        .inp,textarea.inp{width:100%;border:1.5px solid var(--line);border-radius:10px;padding:10px 12px;font-family:inherit;font-size:13.5px;background:#fffdf6;outline:0;}
        .inp:focus{border-color:var(--gold);}
        textarea.inp{resize:vertical;min-height:64px;}
        .grid-3{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;}
        .grid-2{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
        @media(max-width:700px){.grid-3,.grid-2{grid-template-columns:1fr;}}
        .q-card{border:1.5px solid var(--line);border-radius:14px;padding:16px;margin-bottom:14px;background:#fff;}
        .q-top{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px;}
        .q-num{font-family:'Aref Ruqaa',serif;font-size:17px;color:var(--ink-teal);}
        .q-tools{display:flex;gap:6px;}
        .q-tools button{border:1px solid var(--line);background:#fffdf6;border-radius:8px;width:30px;height:30px;cursor:pointer;font-size:13px;}
        .q-tools button:hover{border-color:var(--gold);}
        .opt-row{display:flex;align-items:center;gap:10px;margin-bottom:8px;}
        .opt-row input[type=radio]{accent-color:var(--ink-teal);width:18px;height:18px;cursor:pointer;flex-shrink:0;}
        .opt-row .inp{flex:1;}
        .opt-row.correct .inp{border-color:#2e8b57;background:rgba(46,139,87,.06);}
        .opt-hint{font-size:11.5px;color:var(--muted);margin:2px 0 10px;}
        .check{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;cursor:pointer;}
        .check input{accent-color:var(--ink-teal);width:16px;height:16px;}
        .form-actions{display:flex;gap:10px;justify-content:flex-start;margin-top:8px;flex-wrap:wrap;}
        .row-item{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:13px 0;border-bottom:1px solid var(--line);flex-wrap:wrap;}
        .row-item:last-child{border-bottom:none;}
        .who b{color:var(--text-dark);font-size:14px;display:block;}
        .who span{font-size:12px;color:#5c584c;}
        .st{border-radius:999px;padding:4px 12px;font-size:11.5px;font-weight:700;}
        .st-on{background:rgba(46,139,87,.14);color:#1f6b41;}
        .st-off{background:rgba(28,26,21,.06);color:#6b675c;}
        .acts{display:flex;gap:8px;flex-wrap:wrap;}
        .empty{color:#9a918a;text-align:center;padding:28px 0;font-size:13.5px;}
        .modal-back{position:fixed;inset:0;background:rgba(9,40,36,.6);display:flex;align-items:center;justify-content:center;z-index:80;padding:16px;}
        .modal{background:var(--parchment);border-radius:16px;max-width:420px;width:100%;padding:24px;}
        .modal h3{font-family:'Aref Ruqaa',serif;color:var(--ink-teal);margin-bottom:10px;font-size:19px;}
        .modal p{font-size:13.5px;color:#5c584c;margin-bottom:18px;line-height:1.7;}
      `}</style>

      <div className="qz-head">
        <span className="qz-count">{loading ? '...' : `${quizzes.length} اختبار`}</span>
        {!editing && <button className="btn btn-ok" onClick={startNew}>+ اختبار جديد</button>}
      </div>

      {error && <div className="msg error">{error}</div>}
      {success && <div className="msg success">{success}</div>}

      {editing && (
        <form className="panel" onSubmit={save}>
          <h2 style={{ fontFamily: "'Aref Ruqaa', serif", color: 'var(--ink-teal)', marginBottom: 16, fontSize: 20 }}>
            {editing === 'new' ? 'اختبار جديد' : 'تعديل الاختبار'}
          </h2>

          <div className="field">
            <label>عنوان الاختبار</label>
            <input className="inp" value={form.title} onChange={(e) => setField('title', e.target.value)} placeholder="مثال: اختبار قصير — المتتاليات العددية" />
          </div>
          <div className="field">
            <label>وصف (اختياري)</label>
            <textarea className="inp" value={form.description} onChange={(e) => setField('description', e.target.value)} />
          </div>

          <div className="grid-3">
            <div className="field">
              <label>المستوى</label>
              <select className="inp" value={form.level} onChange={(e) => setForm((f) => ({ ...f, level: e.target.value, trimester: '', unit: '' }))}>
                <option value="">اختر المستوى</option>
                {LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
            </div>
            <div className="field">
              <label>المادة</label>
              <select className="inp" value={form.module} onChange={(e) => setField('module', e.target.value)}>
                <option value="">اختر المادة</option>
                {MODULES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            <div className="field">
              {isBac ? (
                <>
                  <label>الوحدة (كما في الدروس)</label>
                  <input className="inp" value={form.unit} onChange={(e) => setField('unit', e.target.value)} placeholder="مثال: الوحدة الأولى" />
                </>
              ) : (
                <>
                  <label>الفصل</label>
                  <select className="inp" value={form.trimester} onChange={(e) => setField('trimester', e.target.value)} disabled={!form.level}>
                    <option value="">اختر الفصل</option>
                    {TRIMESTERS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </>
              )}
            </div>
          </div>

          <div className="field">
            <label className="check">
              <input type="checkbox" checked={form.published} onChange={(e) => setField('published', e.target.checked)} />
              منشور — يظهر للطلاب
            </label>
          </div>

          <h3 style={{ fontFamily: "'Aref Ruqaa', serif", color: 'var(--ink-teal)', margin: '18px 0 12px', fontSize: 18 }}>
            الأسئلة ({form.questions.length})
          </h3>

          {form.questions.map((q, i) => (
            <div className="q-card" key={i}>
              <div className="q-top">
                <span className="q-num">السؤال {i + 1}</span>
                <div className="q-tools">
                  <button type="button" onClick={() => moveQ(i, -1)} title="أعلى" disabled={i === 0}>↑</button>
                  <button type="button" onClick={() => moveQ(i, 1)} title="أسفل" disabled={i === form.questions.length - 1}>↓</button>
                  <button type="button" onClick={() => removeQ(i)} title="حذف" disabled={form.questions.length === 1}>✕</button>
                </div>
              </div>
              <div className="field">
                <textarea className="inp" placeholder="نص السؤال…" value={q.text} onChange={(e) => setQ(i, { text: e.target.value })} />
              </div>
              <p className="opt-hint">اختر الدائرة بجانب الإجابة الصحيحة. يمكن ترك خيارين فارغين.</p>
              {q.options.map((o, k) => (
                <div className={'opt-row' + (q.correct === k ? ' correct' : '')} key={k}>
                  <input type="radio" name={`correct-${i}`} checked={q.correct === k} onChange={() => setQ(i, { correct: k })} title="الإجابة الصحيحة" />
                  <input className="inp" placeholder={`الخيار ${k + 1}`} value={o} onChange={(e) => setOpt(i, k, e.target.value)} />
                </div>
              ))}
              <div className="field" style={{ marginTop: 10 }}>
                <label>شرح الإجابة (اختياري — يظهر بعد الإجابة)</label>
                <input className="inp" value={q.explanation} onChange={(e) => setQ(i, { explanation: e.target.value })} />
              </div>
            </div>
          ))}

          <button type="button" className="btn btn-ghost" onClick={addQ}>+ إضافة سؤال</button>

          <div className="form-actions" style={{ marginTop: 18 }}>
            <button type="submit" className="btn btn-ok" disabled={busy}>{busy ? 'جارٍ الحفظ…' : 'حفظ الاختبار'}</button>
            <button type="button" className="btn btn-ghost" onClick={() => { setEditing(null); setForm(emptyForm()); }} disabled={busy}>إلغاء</button>
          </div>
        </form>
      )}

      <div className="panel">
        {loading ? (
          <div className="empty">...جارٍ التحميل</div>
        ) : quizzes.length === 0 ? (
          <div className="empty">لا توجد اختبارات بعد — أنشئ أول اختبار.</div>
        ) : (
          quizzes.map((q) => (
            <div className="row-item" key={q.id}>
              <div className="who">
                <b>{q.title}</b>
                <span>{scopeLabel(q)} · {(q.questions || []).length} سؤال · {fmtDate(q.createdAt)}</span>
              </div>
              <span className={'st ' + (q.published === false ? 'st-off' : 'st-on')}>
                {q.published === false ? 'مسودة' : 'منشور'}
              </span>
              <div className="acts">
                <button className="btn btn-ghost btn-sm" onClick={() => startEdit(q)}>تعديل</button>
                <button className="btn btn-ghost btn-sm" onClick={() => togglePublished(q)}>
                  {q.published === false ? 'نشر' : 'إخفاء'}
                </button>
                <button className="btn btn-no btn-sm" onClick={() => setDeleting(q)}>حذف</button>
              </div>
            </div>
          ))
        )}
      </div>

      {deleting && (
        <div className="modal-back" onClick={() => setDeleting(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>حذف الاختبار</h3>
            <p>سيتم حذف «{deleting.title}» نهائيًا. نتائج الطلاب المرتبطة به ستبقى محفوظة لكنها لن تظهر.</p>
            <div className="acts">
              <button className="btn btn-no" onClick={confirmDelete} disabled={busy}>{busy ? '…' : 'نعم، احذف'}</button>
              <button className="btn btn-ghost" onClick={() => setDeleting(null)}>إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}

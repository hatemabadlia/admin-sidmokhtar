// src/pages/AdminExamsManage.jsx — إدارة الامتحانات (PDF): عرض/تعديل البيانات/حذف (مع حذف الملف من R2)
import React, { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, query, orderBy, doc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import AdminLayout from '../components/AdminLayout';
import { LEVELS, MODULES, levelLabel, moduleLabel, fmtDate } from '../lib/access';
import { deleteFromR2, getExamViewUrl } from '../lib/r2';

const TRIMESTERS = [
  { value: 't1', label: 'الفصل الأول' },
  { value: 't2', label: 'الفصل الثاني' },
  { value: 't3', label: 'الفصل الثالث' },
];
const TRI_LABEL = Object.fromEntries(TRIMESTERS.map((t) => [t.value, t.label]));
const TYPE_LABEL = { exam: 'اختبار', quiz: 'فرض' };

const scopeLabel = (x) =>
  `${levelLabel(x.level)} · ${moduleLabel(x.module)}${x.level === 'bac' ? (x.unit ? ` · ${x.unit}` : '') : (x.trimester ? ` · ${TRI_LABEL[x.trimester] || x.trimester}` : '')}`;

const fmtSize = (b) => (!b ? '' : b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`);

export default function AdminExamsManage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [filterLevel, setFilterLevel] = useState('');
  const [opening, setOpening] = useState(''); // examId الجاري تجهيز رابطه

  // ملفات R2 تُفتح برابط موقّع قصير العمر؛ الملفات القديمة (Firebase) برابطها المباشر
  const openPdf = async (x) => {
    if (x.storage !== 'r2' || !x.r2Key) {
      window.open(x.pdfURL, '_blank', 'noopener,noreferrer');
      return;
    }
    // افتح النافذة قبل await حتى لا يحجبها المتصفح
    const win = window.open('', '_blank', 'noopener,noreferrer');
    setOpening(x.id); setError('');
    try {
      const url = await getExamViewUrl(x.id);
      if (win) win.location.href = url; else window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      win?.close();
      setError(e.message || 'تعذّر فتح الملف.');
    } finally { setOpening(''); }
  };
  const [filterModule, setFilterModule] = useState('');

  const [editing, setEditing] = useState(null); // exam doc
  const [form, setForm] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true); setError('');
    try {
      const snap = await getDocs(query(collection(db, 'exams'), orderBy('createdAt', 'desc')));
      setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e); setError('تعذّر تحميل الامتحانات.');
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(
    () => items.filter((x) => (!filterLevel || x.level === filterLevel) && (!filterModule || x.module === filterModule)),
    [items, filterLevel, filterModule]
  );

  const startEdit = (x) => {
    setEditing(x);
    setForm({
      title: x.title || '', description: x.description || '', level: x.level || '', module: x.module || '',
      type: x.type || 'exam', trimester: x.trimester || '', unit: x.unit || '',
    });
    setSuccess(''); setError('');
  };

  const save = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) { setError('أدخل العنوان.'); return; }
    const isBac = form.level === 'bac';
    if (isBac && !form.unit.trim()) { setError('أدخل الوحدة.'); return; }
    if (!isBac && !form.trimester) { setError('اختر الفصل.'); return; }
    setBusy(true); setError('');
    try {
      await updateDoc(doc(db, 'exams', editing.id), {
        title: form.title.trim(),
        description: form.description.trim(),
        level: form.level,
        module: form.module,
        type: form.type,
        trimester: isBac ? null : form.trimester,
        unit: isBac ? form.unit.trim() : null,
        updatedAt: serverTimestamp(),
      });
      setEditing(null); setForm(null);
      setSuccess('تم حفظ التعديلات ✅');
      load();
    } catch (err) { console.error(err); setError('تعذّر الحفظ.'); }
    finally { setBusy(false); }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setBusy(true); setError('');
    try {
      // الملف من R2 أولًا (إن كان مخزّنًا هناك) ثم المستند
      if (deleting.storage === 'r2' && deleting.r2Key) {
        try { await deleteFromR2(deleting.r2Key); }
        catch (e) { console.warn('R2 delete failed (continuing):', e); }
      }
      await deleteDoc(doc(db, 'exams', deleting.id));
      setDeleting(null);
      setSuccess('تم حذف الامتحان.');
      load();
    } catch (err) { console.error(err); setError('تعذّر الحذف.'); }
    finally { setBusy(false); }
  };

  return (
    <AdminLayout title="إدارة الامتحانات (PDF)" subtitle="تعديل بيانات المواضيع المرفوعة أو حذفها">
      <style>{`
        .ex-tools{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:16px;}
        .inp{border:1.5px solid var(--line);border-radius:10px;padding:10px 12px;font-family:inherit;font-size:13.5px;background:#fffdf6;outline:0;}
        .inp:focus{border-color:var(--gold);}
        .ex-count{font-size:13px;color:var(--muted);margin-inline-start:auto;}
        .panel{background:#fffdf8;border:1px solid var(--line);border-radius:16px;padding:22px;margin-bottom:20px;}
        .row-item{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:13px 0;border-bottom:1px solid var(--line);flex-wrap:wrap;}
        .row-item:last-child{border-bottom:none;}
        .who{min-width:0;flex:1;}
        .who b{color:var(--text-dark);font-size:14px;display:block;}
        .who span{font-size:12px;color:#5c584c;}
        .tag{border-radius:999px;padding:3px 10px;font-size:11px;font-weight:700;margin-inline-start:6px;vertical-align:middle;}
        .tag-exam{background:rgba(14,59,54,.1);color:var(--ink-teal);}
        .tag-quiz{background:rgba(227,162,60,.16);color:#7a5612;}
        .tag-r2{background:rgba(70,110,180,.12);color:#2c4a8c;}
        .tag-fb{background:rgba(28,26,21,.06);color:#6b675c;}
        .acts{display:flex;gap:8px;flex-wrap:wrap;}
        .btn{border:0;border-radius:10px;padding:8px 14px;cursor:pointer;font-family:inherit;font-weight:700;font-size:12.5px;text-decoration:none;display:inline-flex;align-items:center;}
        .btn-ok{background:var(--ink-teal);color:var(--parchment);}
        .btn-ghost{background:var(--parchment-dim);color:var(--text-dark);}
        .btn-no{background:transparent;border:1.5px solid rgba(178,58,46,.4);color:#8c2a20;}
        .btn:disabled{opacity:.6;cursor:not-allowed;}
        .msg{border-radius:12px;padding:12px 16px;font-size:13.5px;margin-bottom:16px;}
        .msg.error{background:rgba(178,58,46,.08);border:1px solid rgba(178,58,46,.3);color:#8c2a20;}
        .msg.success{background:rgba(46,139,87,.1);border:1px solid rgba(46,139,87,.3);color:#1f6b41;}
        .empty{color:#9a918a;text-align:center;padding:28px 0;font-size:13.5px;}
        .field{margin-bottom:12px;}
        .field label{display:block;font-size:12.5px;font-weight:700;margin-bottom:6px;color:var(--text-dark);}
        .field .inp{width:100%;}
        .grid-2{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
        @media(max-width:600px){.grid-2{grid-template-columns:1fr;}}
        .modal-back{position:fixed;inset:0;background:rgba(9,40,36,.6);display:flex;align-items:center;justify-content:center;z-index:80;padding:16px;}
        .modal{background:var(--parchment);border-radius:16px;max-width:520px;width:100%;padding:24px;max-height:92svh;overflow:auto;}
        .modal h3{font-family:'Aref Ruqaa',serif;color:var(--ink-teal);margin-bottom:14px;font-size:19px;}
        .modal p{font-size:13.5px;color:#5c584c;margin-bottom:18px;line-height:1.7;}
      `}</style>

      {error && <div className="msg error">{error}</div>}
      {success && <div className="msg success">{success}</div>}

      <div className="ex-tools">
        <select className="inp" value={filterLevel} onChange={(e) => setFilterLevel(e.target.value)}>
          <option value="">كل المستويات</option>
          {LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
        </select>
        <select className="inp" value={filterModule} onChange={(e) => setFilterModule(e.target.value)}>
          <option value="">كل المواد</option>
          {MODULES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
        <span className="ex-count">{loading ? '...' : `${filtered.length} من ${items.length}`}</span>
      </div>

      <div className="panel">
        {loading ? (
          <div className="empty">...جارٍ التحميل</div>
        ) : filtered.length === 0 ? (
          <div className="empty">لا توجد امتحانات مطابقة.</div>
        ) : (
          filtered.map((x) => (
            <div className="row-item" key={x.id}>
              <div className="who">
                <b>
                  {x.title}
                  <span className={'tag ' + (x.type === 'quiz' ? 'tag-quiz' : 'tag-exam')}>{TYPE_LABEL[x.type] || x.type || '—'}</span>
                  <span className={'tag ' + (x.storage === 'r2' ? 'tag-r2' : 'tag-fb')}>{x.storage === 'r2' ? 'R2' : 'Firebase'}</span>
                </b>
                <span>{scopeLabel(x)} · {fmtDate(x.createdAt)}{x.fileSize ? ` · ${fmtSize(x.fileSize)}` : ''}</span>
              </div>
              <div className="acts">
                {x.pdfURL && (
                  <button className="btn btn-ghost" onClick={() => openPdf(x)} disabled={opening === x.id}>
                    {opening === x.id ? '…' : 'عرض PDF'}
                  </button>
                )}
                <button className="btn btn-ok" onClick={() => startEdit(x)}>تعديل</button>
                <button className="btn btn-no" onClick={() => setDeleting(x)}>حذف</button>
              </div>
            </div>
          ))
        )}
      </div>

      {editing && form && (
        <div className="modal-back" onClick={() => setEditing(null)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={save}>
            <h3>تعديل بيانات الامتحان</h3>
            <div className="field"><label>العنوان</label><input className="inp" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
            <div className="field"><label>الوصف</label><textarea className="inp" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div className="grid-2">
              <div className="field"><label>المستوى</label>
                <select className="inp" value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value, trimester: '', unit: '' })}>
                  {LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                </select>
              </div>
              <div className="field"><label>المادة</label>
                <select className="inp" value={form.module} onChange={(e) => setForm({ ...form, module: e.target.value })}>
                  {MODULES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
              <div className="field"><label>النوع</label>
                <select className="inp" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  <option value="exam">اختبار</option><option value="quiz">فرض</option>
                </select>
              </div>
              <div className="field">
                {form.level === 'bac' ? (
                  <><label>الوحدة</label><input className="inp" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} /></>
                ) : (
                  <><label>الفصل</label>
                    <select className="inp" value={form.trimester} onChange={(e) => setForm({ ...form, trimester: e.target.value })}>
                      <option value="">اختر الفصل</option>
                      {TRIMESTERS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select></>
                )}
              </div>
            </div>
            <p style={{ fontSize: 12 }}>لتغيير ملف PDF نفسه: احذف الامتحان وارفعه من جديد.</p>
            <div className="acts">
              <button type="submit" className="btn btn-ok" disabled={busy}>{busy ? '…' : 'حفظ'}</button>
              <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>إلغاء</button>
            </div>
          </form>
        </div>
      )}

      {deleting && (
        <div className="modal-back" onClick={() => setDeleting(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>حذف الامتحان</h3>
            <p>سيتم حذف «{deleting.title}» نهائيًا{deleting.storage === 'r2' ? ' مع ملفه من R2' : ''}. لا يمكن التراجع.</p>
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

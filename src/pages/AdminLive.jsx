// src/pages/AdminLive.jsx — جدولة الحصص المباشرة
// liveSessions/{id} = { title, description, level ('all'|'4am'|...), module ('all'|'math'|'physics'),
//   startAt (Timestamp), durationMin, link, recordingUrl, createdAt }
import React, { useEffect, useState } from 'react';
import { collection, getDocs, query, orderBy, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import AdminLayout from '../components/AdminLayout';
import { LEVELS, MODULES, levelLabel, moduleLabel, tsToMs } from '../lib/access';

const emptyForm = () => ({
  title: '', description: '', level: 'all', module: 'all', date: '', time: '', durationMin: 60, link: '', recordingUrl: '',
});

const toLocalInput = (ms) => {
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, '0');
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
};

const fmtWhen = (ms) => new Date(ms).toLocaleString('ar-DZ', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

const statusOf = (s, now = Date.now()) => {
  const start = tsToMs(s.startAt) || 0;
  const end = start + (Number(s.durationMin) || 60) * 60000;
  if (now < start) return 'upcoming';
  if (now <= end) return 'live';
  return 'ended';
};
const STATUS = { upcoming: ['قادمة', 'st-up'], live: ['مباشر الآن', 'st-live'], ended: ['انتهت', 'st-end'] };

export default function AdminLive() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [editing, setEditing] = useState(null); // null | 'new' | id
  const [form, setForm] = useState(emptyForm());
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true); setError('');
    try {
      const snap = await getDocs(query(collection(db, 'liveSessions'), orderBy('startAt', 'desc')));
      setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); setError('تعذّر تحميل الحصص.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const startNew = () => { setForm(emptyForm()); setEditing('new'); setSuccess(''); };
  const startEdit = (s) => {
    const { date, time } = toLocalInput(tsToMs(s.startAt) || Date.now());
    setForm({
      title: s.title || '', description: s.description || '', level: s.level || 'all', module: s.module || 'all',
      date, time, durationMin: s.durationMin || 60, link: s.link || '', recordingUrl: s.recordingUrl || '',
    });
    setEditing(s.id); setSuccess('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const save = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.title.trim()) return setError('أدخل عنوان الحصة.');
    if (!form.date || !form.time) return setError('حدّد التاريخ والوقت.');
    if (!/^https?:\/\//.test(form.link.trim())) return setError('أدخل رابط البث (يبدأ بـ https://).');
    const startMs = new Date(`${form.date}T${form.time}`).getTime();
    if (Number.isNaN(startMs)) return setError('تاريخ/وقت غير صالح.');
    setBusy(true);
    const payload = {
      title: form.title.trim(),
      description: form.description.trim(),
      level: form.level,
      module: form.module,
      startAt: Timestamp.fromMillis(startMs),
      durationMin: Number(form.durationMin) || 60,
      link: form.link.trim(),
      recordingUrl: form.recordingUrl.trim() || null,
      updatedAt: serverTimestamp(),
    };
    try {
      if (editing === 'new') await addDoc(collection(db, 'liveSessions'), { ...payload, createdAt: serverTimestamp() });
      else await updateDoc(doc(db, 'liveSessions', editing), payload);
      setEditing(null); setForm(emptyForm()); setSuccess('تم الحفظ ✅'); load();
    } catch (err) { console.error(err); setError('تعذّر الحفظ.'); }
    finally { setBusy(false); }
  };

  const remove = async (s) => {
    if (!window.confirm(`حذف الحصة «${s.title}»؟`)) return;
    try { await deleteDoc(doc(db, 'liveSessions', s.id)); load(); }
    catch (err) { console.error(err); setError('تعذّر الحذف.'); }
  };

  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <AdminLayout title="الحصص المباشرة" subtitle="جدولة البث المباشر ورفع رابط التسجيل بعد الانتهاء">
      <style>{`
        .lv-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:18px;}
        .btn{border:0;border-radius:10px;padding:10px 18px;cursor:pointer;font-family:inherit;font-weight:700;font-size:13px;text-decoration:none;display:inline-flex;align-items:center;gap:6px;}
        .btn-ok{background:var(--ink-teal);color:var(--parchment);}
        .btn-ghost{background:var(--parchment-dim);color:var(--text-dark);}
        .btn-no{background:transparent;border:1.5px solid rgba(178,58,46,.4);color:#8c2a20;}
        .btn-sm{padding:7px 12px;font-size:12px;}
        .btn:disabled{opacity:.6;cursor:not-allowed;}
        .msg{border-radius:12px;padding:12px 16px;font-size:13.5px;margin-bottom:16px;}
        .msg.error{background:rgba(178,58,46,.08);border:1px solid rgba(178,58,46,.3);color:#8c2a20;}
        .msg.success{background:rgba(46,139,87,.1);border:1px solid rgba(46,139,87,.3);color:#1f6b41;}
        .panel{background:#fffdf8;border:1px solid var(--line);border-radius:16px;padding:22px;margin-bottom:20px;}
        .field{margin-bottom:14px;}
        .field label{display:block;font-size:12.5px;font-weight:700;margin-bottom:6px;color:var(--text-dark);}
        .inp{width:100%;border:1.5px solid var(--line);border-radius:10px;padding:10px 12px;font-family:inherit;font-size:13.5px;background:#fffdf6;outline:0;}
        .inp:focus{border-color:var(--gold);}
        .grid-2{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
        .grid-3{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;}
        @media(max-width:700px){.grid-2,.grid-3{grid-template-columns:1fr;}}
        .row-item{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:13px 0;border-bottom:1px solid var(--line);flex-wrap:wrap;}
        .row-item:last-child{border-bottom:none;}
        .who{flex:1;min-width:0;}
        .who b{color:var(--text-dark);font-size:14px;display:block;}
        .who span{font-size:12px;color:#5c584c;}
        .st{border-radius:999px;padding:4px 12px;font-size:11.5px;font-weight:700;}
        .st-up{background:rgba(227,162,60,.18);color:#7a5612;}
        .st-live{background:rgba(178,58,46,.12);color:#8c2a20;animation:lv-pulse 1.4s infinite;}
        .st-end{background:rgba(28,26,21,.06);color:#6b675c;}
        @keyframes lv-pulse{0%,100%{opacity:1}50%{opacity:.55}}
        .acts{display:flex;gap:8px;flex-wrap:wrap;}
        .empty{color:#9a918a;text-align:center;padding:28px 0;font-size:13.5px;}
      `}</style>

      <div className="lv-head">
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>{loading ? '...' : `${items.length} حصة`}</span>
        {!editing && <button className="btn btn-ok" onClick={startNew}>+ حصة جديدة</button>}
      </div>
      {error && <div className="msg error">{error}</div>}
      {success && <div className="msg success">{success}</div>}

      {editing && (
        <form className="panel" onSubmit={save}>
          <h2 style={{ fontFamily: "'Aref Ruqaa', serif", color: 'var(--ink-teal)', marginBottom: 16, fontSize: 20 }}>
            {editing === 'new' ? 'حصة مباشرة جديدة' : 'تعديل الحصة'}
          </h2>
          <div className="field"><label>العنوان</label><input className="inp" value={form.title} onChange={(e) => setF('title', e.target.value)} placeholder="مثال: مراجعة الدوال — حصة مباشرة" /></div>
          <div className="field"><label>الوصف (اختياري)</label><textarea className="inp" rows={2} value={form.description} onChange={(e) => setF('description', e.target.value)} /></div>
          <div className="grid-2">
            <div className="field"><label>المستوى</label>
              <select className="inp" value={form.level} onChange={(e) => setF('level', e.target.value)}>
                <option value="all">كل المستويات</option>
                {LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
            </div>
            <div className="field"><label>المادة</label>
              <select className="inp" value={form.module} onChange={(e) => setF('module', e.target.value)}>
                <option value="all">عامة</option>
                {MODULES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
          </div>
          <div className="grid-3">
            <div className="field"><label>التاريخ</label><input className="inp" type="date" value={form.date} onChange={(e) => setF('date', e.target.value)} /></div>
            <div className="field"><label>الوقت</label><input className="inp" type="time" value={form.time} onChange={(e) => setF('time', e.target.value)} /></div>
            <div className="field"><label>المدة (دقيقة)</label><input className="inp" type="number" min="15" step="15" value={form.durationMin} onChange={(e) => setF('durationMin', e.target.value)} /></div>
          </div>
          <div className="field"><label>رابط البث (YouTube Live / Google Meet / Zoom)</label><input className="inp" dir="ltr" value={form.link} onChange={(e) => setF('link', e.target.value)} placeholder="https://meet.google.com/..." /></div>
          <div className="field"><label>رابط التسجيل بعد الانتهاء (اختياري)</label><input className="inp" dir="ltr" value={form.recordingUrl} onChange={(e) => setF('recordingUrl', e.target.value)} placeholder="https://youtu.be/..." /></div>
          <div className="acts">
            <button type="submit" className="btn btn-ok" disabled={busy}>{busy ? '…' : 'حفظ'}</button>
            <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>إلغاء</button>
          </div>
        </form>
      )}

      <div className="panel">
        {loading ? <div className="empty">...جارٍ التحميل</div>
          : items.length === 0 ? <div className="empty">لا توجد حصص مجدولة.</div>
          : items.map((s) => {
            const st = statusOf(s);
            const [label, cls] = STATUS[st];
            return (
              <div className="row-item" key={s.id}>
                <div className="who">
                  <b>{s.title}</b>
                  <span>
                    {s.level === 'all' ? 'كل المستويات' : levelLabel(s.level)} · {s.module === 'all' ? 'عامة' : moduleLabel(s.module)} · {fmtWhen(tsToMs(s.startAt))} · {s.durationMin} د
                  </span>
                </div>
                <span className={'st ' + cls}>{label}</span>
                <div className="acts">
                  <a className="btn btn-ghost btn-sm" href={s.link} target="_blank" rel="noopener noreferrer">الرابط ↗</a>
                  <button className="btn btn-ghost btn-sm" onClick={() => startEdit(s)}>تعديل</button>
                  <button className="btn btn-no btn-sm" onClick={() => remove(s)}>حذف</button>
                </div>
              </div>
            );
          })}
      </div>
    </AdminLayout>
  );
}

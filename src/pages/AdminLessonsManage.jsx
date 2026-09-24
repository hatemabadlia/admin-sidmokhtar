// src/pages/AdminLessonsManage.jsx — إدارة الدروس: تعديل وحذف
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection,
  getDocs,
  query,
  orderBy,
  doc,
  deleteDoc,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import AdminLayout from '../components/AdminLayout';
import { levelLabel, moduleLabel, LEVELS, MODULES } from '../lib/access';
import { uploadLessonMedia, deleteLessonMedia, inspectVideoFile } from '../lib/media';

const TRIMESTERS = [
  { value: 't1', label: 'الفصل الأول' },
  { value: 't2', label: 'الفصل الثاني' },
  { value: 't3', label: 'الفصل الثالث' },
];

const DEFAULT_FORM = {
  title: '',
  description: '',
  level: '',
  module: '',
  trimester: '',
  unit: '',
};

/**
 * إدارة الدروس — /lessons/manage
 * عرض كل الدروس مع فلاتر (المستوى + المادة)، تعديل بيانات الدرس
 * (مع إمكانية استبدال الفيديو)، وحذف الدرس نهائيًا من Firestore
 * (مع حذف الفيديو والصورة المصغّرة من R2 بأفضل جهد).
 */
export default function AdminLessonsManage() {
  const [lessons, setLessons] = useState([]);
  const [filterLevel, setFilterLevel] = useState('all');
  const [filterModule, setFilterModule] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // نافذة التعديل
  const [editing, setEditing] = useState(null); // lesson object أو null
  const [editForm, setEditForm] = useState(DEFAULT_FORM);
  const [videoFile, setVideoFile] = useState(null);
  const [videoProgress, setVideoProgress] = useState(0);
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  // نافذة الحذف
    const [deleting, setDeleting] = useState(null); // lesson object أو null
  const [delBusy, setDelBusy] = useState(false);

  const navigate = useNavigate();

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const q = query(collection(db, 'lessons'), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      setLessons(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error('Lessons load failed:', e);
      setError('تعذّر تحميل الدروس حاليًا، حاول لاحقًا.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = lessons.filter(
    (l) =>
      (filterLevel === 'all' || l.level === filterLevel) &&
      (filterModule === 'all' || l.module === filterModule)
  );

  const groupMeta = (l) => {
    if (l.level === 'bac') return l.unit ? `الوحدة: ${l.unit}` : 'بدون وحدة';
    const t = TRIMESTERS.find((x) => x.value === l.trimester);
    return t ? t.label : (l.trimester || 'بدون فصل');
  };

  // ==== التعديل ====
  const openEdit = (l) => {
    setEditing(l);
    setEditForm({
      title: l.title || '',
      description: l.description || '',
      level: l.level || '',
      module: l.module || '',
      trimester: l.trimester || '',
      unit: l.unit || '',
    });
    setVideoFile(null);
    setVideoProgress(0);
    setSaveMsg('');
  };

  const saveEdit = async (e) => {
    e.preventDefault();
    if (!editForm.title.trim()) { setSaveMsg('أدخل عنوان الدرس.'); return; }
    if (!editForm.level) { setSaveMsg('اختر المستوى الدراسي.'); return; }
    if (!editForm.module) { setSaveMsg('اختر المادة.'); return; }
    if (editForm.level === 'bac' && !editForm.unit.trim()) { setSaveMsg('أدخل الوحدة للبكالوريا.'); return; }
    if (editForm.level !== 'bac' && !editForm.trimester) { setSaveMsg('اختر الفصل الدراسي.'); return; }
    if (videoFile) { try { inspectVideoFile(videoFile); } catch (err) { setSaveMsg(err.message); return; } }

    setSaveBusy(true);
    setSaveMsg('');
    try {
      const ref = doc(db, 'lessons', editing.id);
      const patch = {
        title: editForm.title.trim(),
        description: editForm.description.trim(),
        level: editForm.level,
        module: editForm.module,
        trimester: editForm.level === 'bac' ? null : editForm.trimester,
        unit: editForm.level === 'bac' ? editForm.unit.trim() : null,
        updatedAt: new Date(),
      };

      // إذا اختار فيديو جديدًا: ارفعه (مع صورته المصغّرة) إلى R2 ثم اربطه بالدرس.
      if (videoFile) {
        setSaveMsg('جارٍ رفع الفيديو الجديد...');
        const media = await uploadLessonMedia(videoFile, { level: editForm.level, module: editForm.module }, {
          onProgress: setVideoProgress,
        });
        Object.assign(patch, media, { bunnyVideoId: null, bunnyLibraryId: null });
      }

      await updateDoc(ref, patch);

      // تنظيف الفيديو القديم (بأفضل جهد) عند الاستبدال
      if (videoFile) await deleteLessonMedia(editing);

      setSaveMsg('تم حفظ التعديلات ✅');
      load();
      setTimeout(() => setEditing(null), 900);
    } catch (err) {
      console.error('Lesson update failed:', err);
      setSaveMsg(err.message || 'تعذّر حفظ التعديلات.');
    } finally {
      setSaveBusy(false);
    }
  };

  // ==== الحذف ====
  const confirmDelete = async () => {
    if (!deleting) return;
    setDelBusy(true);
    setError('');
    try {
      await deleteDoc(doc(db, 'lessons', deleting.id));
      // حذف الفيديو والصورة من R2 بأفضل جهد — فشله لا يمنع حذف الدرس.
      await deleteLessonMedia(deleting);
      setDeleting(null);
      load();
    } catch (err) {
      console.error('Lesson delete failed:', err);
      setError('تعذّر حذف الدرس — حاول مرة أخرى.');
    } finally {
      setDelBusy(false);
    }
  };

return (
    <AdminLayout title="إدارة الدروس" subtitle="تعديل أو حذف الدروس الموجودة في مكتبة المخ">
      <style>{`
      .filters{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:20px;}
      .filter-select{background:#fffdf6;border:1.5px solid var(--line);border-radius:10px;padding:11px 14px;font-family:inherit;font-size:13.5px;color:var(--text-dark);min-width:190px;}
      .count-chip{margin-right:auto;align-self:center;font-size:12.5px;font-weight:700;color:var(--ink-teal);background:rgba(227,162,60,.14);border:1px dashed rgba(227,162,60,.5);border-radius:999px;padding:6px 14px;}
      .lessons-list{display:flex;flex-direction:column;gap:12px;}
      .lesson-row{display:flex;align-items:center;gap:16px;background:#fffdf6;border:1px solid var(--line);border-radius:14px;padding:12px 16px;transition:box-shadow .2s,border-color .2s;}
      .lesson-row:hover{box-shadow:0 10px 26px rgba(14,59,54,.09);border-color:rgba(227,162,60,.5);}
      .row-thumb{width:92px;height:58px;border-radius:10px;object-fit:cover;background:var(--parchment-dim);display:flex;align-items:center;justify-content:center;color:#8a8574;font-size:20px;flex-shrink:0;}
      .row-body{flex:1;min-width:0;}
      .row-title{font-size:15px;font-weight:700;color:var(--text-dark);margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
      .row-meta{display:flex;gap:6px;flex-wrap:wrap;}
      .row-meta .badge{font-size:11px;font-weight:700;border-radius:999px;padding:3px 10px;color:var(--ink-teal);background:rgba(14,59,54,.07);border:1px solid rgba(14,59,54,.12);}
      .row-meta .badge.gold{background:rgba(227,162,60,.12);color:#7a5612;border-color:rgba(227,162,60,.35);}
      .row-actions{display:flex;gap:8px;flex-shrink:0;}
      .btn{border:0;cursor:pointer;font-family:inherit;font-weight:700;border-radius:10px;font-size:12.5px;padding:9px 16px;transition:all .2s;}
      .btn-edit{background:var(--ink-teal);color:var(--parchment);}
      .btn-edit:hover{background:var(--ink-teal-deep);}
      .btn-del{background:rgba(178,58,46,.1);color:var(--crimson);border:1px solid rgba(178,58,46,.3);}
      .btn-del:hover{background:var(--crimson);color:#fff;}
      .card-link{display:inline-block;margin-bottom:20px;background:var(--ink-teal);color:var(--parchment);font-size:13px;font-weight:700;padding:10px 20px;border-radius:12px;}
      .card-link:hover{background:var(--ink-teal-deep);}
      .empty{text-align:center;color:var(--muted);font-size:14px;padding:50px 0;}
      .msg{border-radius:12px;padding:12px 16px;font-size:13.5px;margin-bottom:18px;line-height:1.6;text-align:right;}
      .msg.error{background:rgba(178,58,46,.08);border:1px solid rgba(178,58,46,.3);color:#8c2a20;}
      .msg.ok{background:rgba(46,139,87,.1);border:1px solid rgba(46,139,87,.3);color:#1f6b41;}
      .msg.info{background:rgba(227,162,60,.1);border:1px solid rgba(227,162,60,.35);color:#7a5612;}
      `}</style>

      <style>{`
      .modal-back{position:fixed;inset:0;background:rgba(7,31,28,.55);z-index:80;display:flex;align-items:center;justify-content:center;padding:20px;}
      .modal{background:#fffdf6;border-radius:18px;padding:28px;width:540px;max-width:100%;max-height:90vh;overflow:auto;box-shadow:0 30px 80px rgba(0,0,0,.3);position:relative;}
      .modal h3{font-family:'Aref Ruqaa',serif;font-size:22px;color:var(--ink-teal);margin-bottom:6px;}
      .modal .m-sub{font-size:12.5px;color:var(--muted);margin-bottom:18px;}
      .close-x{position:absolute;top:12px;left:14px;border:0;background:rgba(14,59,54,.08);color:var(--ink-teal);width:32px;height:32px;border-radius:50%;font-size:15px;cursor:pointer;}
      .field{margin-bottom:16px;}
      .field label{display:block;font-size:13px;font-weight:600;margin-bottom:7px;color:var(--text-dark);}
      .text-input,.select-input,textarea{width:100%;background:#fff;border:1.5px solid var(--line);border-radius:10px;padding:11px 13px;font-family:inherit;font-size:14px;outline:0;transition:border-color .2s;}
      .text-input:focus,.select-input:focus,textarea:focus{border-color:var(--gold);}
      textarea{resize:vertical;min-height:70px;}
      .grid-2{display:grid;grid-template-columns:1fr 1fr;gap:14px;}
      @media(max-width:600px){.grid-2{grid-template-columns:1fr;}}
      .video-note{font-size:12px;color:var(--muted);background:var(--parchment-dim);border-radius:10px;padding:10px 14px;margin-top:8px;}
      .file-drop{border:1.5px dashed rgba(227,162,60,.6);border-radius:12px;padding:16px;text-align:center;cursor:pointer;color:var(--ink-teal);font-size:13px;font-weight:600;background:rgba(227,162,60,.06);}
      .file-drop input{display:none;}
      .file-drop:hover{border-color:var(--gold);background:rgba(227,162,60,.12);}
      .progress-wrap{margin-top:8px;background:var(--line);border-radius:999px;height:6px;overflow:hidden;}
      .progress-bar{height:100%;background:var(--gold);transition:width .2s;}
      .modal-actions{display:flex;gap:10px;justify-content:flex-end;margin-top:6px;}
      .btn-primary{border:0;cursor:pointer;background:var(--ink-teal);color:var(--parchment);font-family:inherit;font-weight:700;font-size:14px;padding:12px 24px;border-radius:12px;transition:all .2s;}
      .btn-primary:hover{background:var(--ink-teal-deep);}
      .btn-primary:disabled{opacity:.6;cursor:not-allowed;}
      .btn-cancel{border:1.5px solid var(--line);background:transparent;color:var(--muted);cursor:pointer;font-family:inherit;font-weight:700;font-size:14px;padding:11px 20px;border-radius:12px;}
      .btn-cancel:hover{color:var(--text-dark);border-color:var(--muted);}
      .btn-danger{border:0;cursor:pointer;background:var(--crimson);color:#fff;font-family:inherit;font-weight:700;font-size:14px;padding:12px 24px;border-radius:12px;transition:all .2s;}
      .btn-danger:hover{background:#8c2a20;}
      .btn-danger:disabled{opacity:.6;cursor:not-allowed;}
      .delete-warn{font-size:14px;color:var(--text-dark);line-height:1.9;}
      .delete-warn b{color:var(--crimson);}
      .spinner{display:inline-block;width:14px;height:14px;border:2.5px solid rgba(246,238,220,.35);border-top-color:#fff;border-radius:50%;animation:sp .7s linear infinite;vertical-align:-2px;}
      @keyframes sp{to{transform:rotate(360deg);}}
      @media(max-width:640px){.lesson-row{flex-direction:column;align-items:flex-start;}.row-actions{width:100%;justify-content:flex-end;}.row-thumb{width:100%;height:120px;}}
      `}</style>

            <button className="card-link" type="button" onClick={() => navigate('/lessons/upload')}>+ رفع درس جديد</button>

      {error && <div className="msg error">{error}</div>}

      <div className="filters">
        <select className="filter-select" value={filterLevel} onChange={(e) => setFilterLevel(e.target.value)}>
          <option value="all">كل المستويات</option>
          {LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
        </select>
        <select className="filter-select" value={filterModule} onChange={(e) => setFilterModule(e.target.value)}>
          <option value="all">كل المواد</option>
          {MODULES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
        <span className="count-chip">{filtered.length} درس</span>
      </div>

      {loading ? (
        <div className="empty">جارٍ التحميل...</div>
      ) : filtered.length === 0 ? (
        <div className="empty">لا توجد دروس مطابقة للفلاتر.</div>
      ) : (
        <div className="lessons-list">
          {filtered.map((l) => (
            <div className="lesson-row" key={l.id}>
              {l.thumbnailURL ? (
                <img
                  className="row-thumb"
                  src={l.thumbnailURL}
                  alt=""
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
              ) : (
                <div className="row-thumb">🎬</div>
              )}
              <div className="row-body">
                <div className="row-title">{l.title}</div>
                <div className="row-meta">
                  <span className="badge">{levelLabel(l.level)}</span>
                  <span className="badge gold">{moduleLabel(l.module)}</span>
                  <span className="badge">{groupMeta(l)}</span>
                  {l.videoKey ? (
                    <span className="badge">🎬 R2{l.videoSize ? ` · ${(l.videoSize / 1048576).toFixed(0)}MB` : ''}</span>
                  ) : l.bunnyVideoId ? (
                    <span className="badge" style={{ color: 'var(--crimson)' }}>⚠ Bunny — أعد رفع الفيديو</span>
                  ) : null}
                </div>
              </div>
              <div className="row-actions">
                <button className="btn btn-edit" type="button" onClick={() => openEdit(l)}>✎ تعديل</button>
                <button className="btn btn-del" type="button" onClick={() => { setDeleting(l); setError(''); }}>🗑 حذف</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ===== نافذة التعديل ===== */}
      {editing && (
        <div className="modal-back" onClick={() => !saveBusy && setEditing(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="close-x" onClick={() => setEditing(null)}>✕</button>
            <h3>تعديل الدرس</h3>
            <p className="m-sub">{editing.title}</p>

            {saveMsg && (
              <div
                className={'msg ' + (
                  saveMsg.startsWith('تم') ? 'ok' : (saveMsg.startsWith('جارٍ') ? 'info' : 'error')
                )}
              >
                {saveMsg}
              </div>
            )}

            <form onSubmit={saveEdit}>
              <div className="field">
                <label>عنوان الدرس</label>
                <input
                  className="text-input"
                  type="text"
                  value={editForm.title}
                  onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                />
              </div>

              <div className="field">
                <label>وصف الدرس (اختياري)</label>
                <textarea
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                />
              </div>

              <div className="grid-2">
                <div className="field">
                  <label>المستوى الدراسي</label>
                  <select
                    className="select-input"
                    value={editForm.level}
                    onChange={(e) => setEditForm({ ...editForm, level: e.target.value, trimester: '', unit: '' })}
                  >
                    <option value="">اختر المستوى</option>
                    {LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>المادة</label>
                  <select
                    className="select-input"
                    value={editForm.module}
                    onChange={(e) => setEditForm({ ...editForm, module: e.target.value })}
                  >
                    <option value="">اختر المادة</option>
                    {MODULES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>
              </div>

              {editForm.level && (
                <div className="field">
                  {editForm.level === 'bac' ? (
                    <>
                      <label>الوحدة</label>
                      <input
                        className="text-input"
                        type="text"
                        placeholder="مثال: الوحدة الثالثة"
                        value={editForm.unit}
                        onChange={(e) => setEditForm({ ...editForm, unit: e.target.value })}
                      />
                    </>
                  ) : (
                    <>
                      <label>الفصل الدراسي</label>
                      <select
                        className="select-input"
                        value={editForm.trimester}
                        onChange={(e) => setEditForm({ ...editForm, trimester: e.target.value })}
                      >
                        <option value="">اختر الفصل</option>
                        {TRIMESTERS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </>
                  )}
                </div>
              )}

              <div className="field">
                <label>الفيديو (اختياري — اتركه فارغًا للإبقاء على الفيديو الحالي)</label>
                <label className="file-drop">
                  <input
                    type="file"
                    accept="video/mp4,video/webm,.mp4,.m4v,.webm"
                    onChange={(e) => setVideoFile(e.target.files?.[0] || null)}
                  />
                  {videoFile ? `📹 ${videoFile.name}` : '📹 اختر فيديو جديدًا للاستبدال'}
                </label>
                {videoFile && videoProgress > 0 && (
                  <div className="progress-wrap"><div className="progress-bar" style={{ width: `${videoProgress}%` }} /></div>
                )}
                <div className="video-note">
                  إذا لم تختر فيديو جديدًا، يبقى الفيديو الحالي كما هو ({editing.videoKey ? 'على R2' : editing.bunnyVideoId ? 'على Bunny — يجب إعادة رفعه' : 'بدون فيديو'}).
                  الأنسب: MP4 (H.264) بدقة 720p.
                </div>
              </div>

              <div className="modal-actions">
                <button type="button" className="btn-cancel" onClick={() => setEditing(null)} disabled={saveBusy}>إلغاء</button>
                <button type="submit" className="btn-primary" disabled={saveBusy}>
                  {saveBusy ? <span className="spinner" /> : 'حفظ التعديلات'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===== نافذة الحذف ===== */}
      {deleting && (
        <div className="modal-back" onClick={() => !delBusy && setDeleting(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 420 }}>
            <button type="button" className="close-x" onClick={() => setDeleting(null)}>✕</button>
            <h3>حذف الدرس</h3>
            <p className="m-sub">تأكيد الحذف النهائي</p>
            <p className="delete-warn">
              هل أنت متأكد من حذف درس <b>«{deleting.title}»</b>؟
              سيُحذف الدرس من مكتبة الدروس نهائيًا، ولن يتمكن الطلاب من مشاهدته بعد الآن.
              {deleting.videoKey && <><br />سيُحذف الفيديو أيضًا من R2.</>}
            </p>
            <div className="modal-actions">
              <button type="button" className="btn-cancel" onClick={() => setDeleting(null)} disabled={delBusy}>إلغاء</button>
              <button type="button" className="btn-danger" onClick={confirmDelete} disabled={delBusy}>
                {delBusy ? 'جارٍ الحذف...' : 'نعم، احذف الدرس'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
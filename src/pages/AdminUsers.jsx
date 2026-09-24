// src/pages/AdminUsers.jsx — عرض جميع المستخدمين وحالة وصولهم (users.unlockedGroups + accessRequests)
import React, { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';
import AdminLayout from '../components/AdminLayout';
import { levelLabel, moduleLabel, fmtDate } from '../lib/access';

const TRIMESTERS = { t1: 'الفصل الأول', t2: 'الفصل الثاني', t3: 'الفصل الثالث' };

// تحويل مفتاح الفتح (level_module[_group]) إلى تسمية مقروءة
// مثال: 1as_math_t1 → «الأولى ثانوي · رياضيات · الفصل الأول»، 1as_math → «… · المادة كاملة»
const unlockLabel = (key) => {
  const [level, module, ...rest] = String(key).split('_');
  const group = rest.join('_');
  const groupText = !group ? 'المادة كاملة' : (TRIMESTERS[group] || group);
  return `${levelLabel(level)} · ${moduleLabel(module)} · ${groupText}`;
};

// «مشترك» = لديه مفتاح فتح واحد على الأقل في unlockedGroups
const unlocksOf = (u) => (Array.isArray(u.unlockedGroups) ? u.unlockedGroups : []);
const isSubscribed = (u) => unlocksOf(u).length > 0;

export default function AdminUsers() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [users, setUsers] = useState([]);
  const [pendingByUser, setPendingByUser] = useState({}); // uid|email → عدد الطلبات قيد الانتظار

  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'sub' | 'simple'

  useEffect(() => {
    const load = async () => {
      try {
        const [usersSnap, reqSnap] = await Promise.all([
          getDocs(collection(db, 'users')),
          getDocs(collection(db, 'accessRequests')),
        ]);

        setUsers(usersSnap.docs.map((d) => ({ id: d.id, ...d.data() })));

        // الطلبات قيد الانتظار لكل مستخدم (بالمعرّف إن وُجد، وإلا بالبريد)
        const map = {};
        reqSnap.docs.forEach((d) => {
          const r = d.data();
          if (r.status !== 'pending') return;
          const k = r.uid || (r.email || '').trim().toLowerCase();
          if (!k) return;
          map[k] = (map[k] || 0) + 1;
        });
        setPendingByUser(map);
      } catch (err) {
        console.error('AdminUsers load failed:', err);
        setError('تعذّر تحميل المستخدمين — تحقق من صلاحيات القراءة.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const pendingFor = (u) =>
    pendingByUser[u.uid || u.id] || pendingByUser[(u.email || '').trim().toLowerCase()] || 0;

  // بحث حسب الاسم أو البريد
  const q = query.trim().toLowerCase();
  const filtered = users.filter((u) => {
    const hay = `${u.name || ''} ${u.email || ''} ${u.uid || ''}`.toLowerCase();
    if (q && !hay.includes(q)) return false;
    const sub = isSubscribed(u);
    if (statusFilter === 'sub' && !sub) return false;
    if (statusFilter === 'simple' && sub) return false;
    return true;
  });

  const totalSub = users.filter(isSubscribed).length;
  const totalSimple = users.length - totalSub;
return (
    <AdminLayout title="المستخدمون" subtitle="عرض جميع المستخدمين وحالة اشتراكاتهم في المنصة">
      <style>{`
        .us-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:22px;}
        .us-stat{background:#fffdf8;border:1px solid var(--line);border-radius:14px;padding:16px 18px;display:flex;align-items:center;gap:14px;}
        .us-stat-icon{width:42px;height:42px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:19px;}
        .us-stat.ic-total .us-stat-icon{background:rgba(14,59,54,.1);}
        .us-stat.ic-sub .us-stat-icon{background:rgba(46,139,87,.12);}
        .us-stat.ic-simple .us-stat-icon{background:rgba(227,162,60,.16);}
        .us-stat-num{font-size:22px;font-weight:800;color:var(--ink-teal);}
        .us-stat-label{font-size:12.5px;color:var(--muted);}
        .us-toolbar{display:flex;align-items:center;gap:12px;margin-bottom:18px;flex-wrap:wrap;}
        .us-search{flex:1;min-width:220px;display:flex;align-items:center;gap:8px;background:#fffdf8;border:1px solid var(--line);border-radius:12px;padding:0 14px;}
        .us-search input{flex:1;border:0;background:transparent;padding:11px 0;font-family:inherit;font-size:13.5px;outline:0;color:var(--text-dark);}
        .us-select{border:1.5px solid var(--line);border-radius:12px;background:#fffdf8;padding:10px 12px;font-family:inherit;font-size:13.5px;color:var(--text-dark);cursor:pointer;outline:0;}
        .us-panel{background:#fffdf8;border:1px solid var(--line);border-radius:16px;overflow:hidden;}
        .us-colhead,.us-row{display:grid;grid-template-columns:2fr 1fr .9fr .9fr 1.4fr 1fr;gap:12px;padding:12px 16px;font-size:13px;align-items:center;}
        .us-colhead{font-size:11.5px;color:var(--muted);font-weight:700;background:#efe3c8;border-bottom:1px solid var(--line);}
        .us-row{border-bottom:1px solid var(--line);transition:background .15s;}
        .us-row:hover{background:#f6f1e4;}
        .us-row:last-child{border-bottom:none;}
        .us-user{display:flex;align-items:center;gap:10px;min-width:0;}
        .us-avatar{width:34px;height:34px;border-radius:50%;background:var(--ink-teal);color:var(--parchment);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;flex-shrink:0;}
        .us-user-name{font-weight:700;color:var(--text-dark);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
        .us-user-mail{font-size:11.5px;color:var(--muted);direction:ltr;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
        .us-badge{display:inline-block;border-radius:999px;padding:4px 12px;font-size:11.5px;font-weight:700;}
        .us-badge-lvl{background:var(--parchment-dim);color:var(--ink-teal);}
        .us-badge-admin{background:rgba(227,162,60,.18);color:#7a5612;}
        .us-badge-user{background:rgba(70,110,180,.12);color:#2c4a8c;}
        .us-courses{font-size:12px;color:var(--muted);line-height:1.6;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
        .us-status{justify-self:start;border-radius:999px;padding:5px 12px;font-size:11.5px;font-weight:700;display:inline-flex;align-items:center;gap:5px;}
        .us-status.sub{background:rgba(46,139,87,.12);color:#1f6b41;}
        .us-status.simple{background:rgba(28,26,21,.06);color:#6b675c;}
        .us-empty{color:#9a918a;text-align:center;padding:40px 0;font-size:13.5px;}
        .us-pending{font-size:11px;color:#7a5612;margin-top:3px;white-space:nowrap;}
        .us-join{font-size:12px;color:var(--muted);}
        @media(max-width:900px){.us-stats{grid-template-columns:1fr;} .us-colhead{display:none;}
          .us-row{grid-template-columns:1fr;gap:8px;padding:16px;}
          .us-courses,.us-join,.us-status{justify-self:start;}}
      `}</style>
<div className="us-stats">
        <div className="us-stat ic-total">
          <div className="us-stat-icon">👥</div>
          <div><div className="us-stat-num">{loading ? '...' : users.length}</div><div className="us-stat-label">إجمالي المستخدمين</div></div>
        </div>
        <div className="us-stat ic-sub">
          <div className="us-stat-icon">✅</div>
          <div><div className="us-stat-num">{loading ? '...' : totalSub}</div><div className="us-stat-label">المشتركون (لديهم وصول مفتوح)</div></div>
        </div>
        <div className="us-stat ic-simple">
          <div className="us-stat-icon">👤</div>
          <div><div className="us-stat-num">{loading ? '...' : totalSimple}</div><div className="us-stat-label">مستخدمون بسيطون</div></div>
        </div>
      </div>

      <div className="us-toolbar">
        <div className="us-search">
          <span>🔎</span>
          <input type="text" placeholder="بحث بالاسم أو البريد الإلكتروني..." value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <select className="us-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">كل الحالات</option>
          <option value="sub">المشتركون</option>
          <option value="simple">مستخدمون بسيطون</option>
        </select>
      </div>
<div className="us-panel">
        <div className="us-colhead">
          <span>المستخدم</span>
          <span>المستوى</span>
          <span>الدور</span>
          <span>الأقسام المفتوحة</span>
          <span>النطاقات</span>
          <span>الحالة / الانضمام</span>
        </div>

        {loading ? (
          <div className="us-empty">...جارٍ التحميل</div>
        ) : error ? (
          <div className="us-empty" style={{ color: '#8c2a20' }}>{error}</div>
        ) : filtered.length === 0 ? (
          <div className="us-empty">لا يوجد مستخدمون مطابقون.</div>
        ) : (
          filtered.map((u) => {
            const unlocks = unlocksOf(u);
            const sub = unlocks.length > 0;
            const pending = pendingFor(u);
            const displayName = u.name || u.email || 'مستخدم';
            const initial = (displayName.charAt(0) || '؟').toUpperCase();
            const scopes = unlocks.map(unlockLabel);

            return (
              <div className="us-row" key={u.id}>
                <div className="us-user">
                  <div className="us-avatar">{initial}</div>
                  <div style={{ minWidth: 0 }}>
                    <div className="us-user-name">{displayName}</div>
                    <div className="us-user-mail">{u.email || '—'}</div>
                  </div>
                </div>

                <span className="us-badge us-badge-lvl">{levelLabel(u.level)}</span>

                <span className={'us-badge ' + (u.role === 'admin' ? 'us-badge-admin' : 'us-badge-user')}>
                  {u.role === 'admin' ? 'مشرف' : 'مستخدم'}
                </span>

                <div className="us-courses">
                  {unlocks.length === 0 ? '—' : <span>{unlocks.length} قسم</span>}
                  {pending > 0 && <div className="us-pending">⏳ {pending} طلب قيد الانتظار</div>}
                </div>

                <div className="us-courses" title={scopes.join(' ، ')}>
                  {scopes.length === 0 ? 'لا يوجد' : scopes.join(' ، ')}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
                  <span className={'us-status ' + (sub ? 'sub' : 'simple')}>
                    {sub ? '✅ مشترك' : '👤 مستخدم بسيط'}
                  </span>
                  <span className="us-join">انضم: {fmtDate(u.createdAt)}</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </AdminLayout>
  );
}
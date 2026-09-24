// src/pages/AdminDashboard.jsx — نظرة عامة (الشريط الجانبي يأتي من AdminLayout)
// الأرقام من البيانات الفعلية: users / lessons / accessCodes / accessRequests
import React, { useEffect, useState } from 'react';
import { collection, getCountFromServer, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { db } from '../firebase/config';
import AdminLayout from '../components/AdminLayout';
import { fmtDate, levelLabel, moduleLabel } from '../lib/access';
import { fetchSales, summarize } from '../lib/sales';
import { fmtMoney } from '../lib/pricing';

const TRIMESTERS = { t1: 'الفصل الأول', t2: 'الفصل الثاني', t3: 'الفصل الثالث' };

const STATUS = {
  pending: { label: 'قيد الانتظار', cls: 'st-pending' },
  approved: { label: 'مقبول ✓', cls: 'st-ok' },
  rejected: { label: 'مرفوض', cls: 'st-no' },
};

// نطاق الطلب: المستوى · المادة · (فصل/وحدة)
const scopeLabel = (r) => {
  const group = r.level === 'bac' ? r.unit : TRIMESTERS[r.trimester];
  return `${levelLabel(r.level)} · ${moduleLabel(r.module)}${group ? ` · ${group}` : ''}`;
};

// «مشترك» = لديه مفتاح فتح واحد على الأقل في unlockedGroups
const isSubscribed = (u) => Array.isArray(u.unlockedGroups) && u.unlockedGroups.length > 0;

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalUsers: 0, subscribed: 0, totalLessons: 0, pendingRequests: 0, activeCodes: 0,
  });
  const [money, setMoney] = useState({ total: 0, month: 0, count: 0 });
  const [recentRequests, setRecentRequests] = useState([]);

  useEffect(() => {
    const loadStats = async () => {
      try {
        const [usersSnap, lessonsSnap, codesSnap, pendingSnap, recentSnap, sales] = await Promise.all([
          getDocs(collection(db, 'users')),
          getCountFromServer(collection(db, 'lessons')),
          getCountFromServer(query(collection(db, 'accessCodes'), where('active', '==', true))),
          getCountFromServer(query(collection(db, 'accessRequests'), where('status', '==', 'pending'))),
          getDocs(query(collection(db, 'accessRequests'), orderBy('createdAt', 'desc'), limit(6))),
          fetchSales(db).catch(() => []),
        ]);
        setMoney(summarize(sales));
        const users = usersSnap.docs.map((d) => d.data());
        setStats({
          totalUsers: users.length,
          subscribed: users.filter(isSubscribed).length,
          totalLessons: lessonsSnap.data().count,
          activeCodes: codesSnap.data().count,
          pendingRequests: pendingSnap.data().count,
        });
        setRecentRequests(recentSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.error('Failed to load dashboard stats:', err);
      } finally {
        setLoading(false);
      }
    };
    loadStats();
  }, []);

  const cards = [
    {
      label: 'إيراد هذا الشهر',
      value: fmtMoney(money.month),
      icon: '💰',
      tone: 't-rev',
      to: '/revenue',
      sub: `${fmtMoney(money.total)} إجمالًا · ${money.count} بيع`,
    },
    { label: 'إجمالي المستخدمين', value: stats.totalUsers, icon: '👥', tone: 't-users' },
    { label: 'المشتركون (لديهم وصول)', value: stats.subscribed, icon: '✅', tone: 't-rev' },
    { label: 'إجمالي الدروس', value: stats.totalLessons, icon: '📚', tone: 't-courses' },
    { label: 'طلبات قيد الانتظار', value: stats.pendingRequests, icon: '⏳', tone: 't-enrolls' },
    { label: 'رموز مفعّلة', value: stats.activeCodes, icon: '🔑', tone: 't-codes' },
  ];

  return (
    <AdminLayout title="نظرة عامة" subtitle="مرحبًا بك مرة أخرى 👋 إليك أحدث أرقام منصة المخ">
      <style>{`
        .dash-hero{background:linear-gradient(120deg,#0E3B36,#14534C);border-radius:18px;padding:26px 28px;color:#F6EEDC;display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:24px;box-shadow:0 12px 30px rgba(14,59,54,.18);position:relative;overflow:hidden;}
        .dash-hero::after{content:'';position:absolute;width:220px;height:220px;border-radius:50%;background:rgba(227,162,60,.1);top:-70px;left:-40px;pointer-events:none;}
        .dash-hero-title{font-family:'Aref Ruqaa',serif;font-size:22px;position:relative;}
        .dash-hero-sub{font-size:13px;color:rgba(246,238,220,.75);margin-top:6px;position:relative;}
        .dash-hero-chip{position:relative;border:1px solid rgba(227,162,60,.5);background:rgba(227,162,60,.14);color:#F0B85C;border-radius:999px;padding:8px 16px;font-size:12px;font-weight:700;white-space:nowrap;}
        .cards-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin-bottom:28px;}
        .stat-card{background:#fffdf8;border:1px solid var(--line);border-radius:16px;padding:20px;display:flex;flex-direction:column;gap:12px;transition:all .2s;}
        .stat-card:hover{transform:translateY(-3px);box-shadow:0 12px 26px rgba(14,59,54,.12);}
        .stat-icon{width:44px;height:44px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:20px;}
        .t-users{background:rgba(14,59,54,.1);}
        .t-courses{background:rgba(227,162,60,.16);}
        .t-enrolls{background:rgba(70,110,180,.12);}
        .t-rev{background:rgba(46,139,87,.12);}
        .t-codes{background:rgba(178,58,46,.1);}
        .stat-value{font-size:24px;font-weight:800;color:var(--ink-teal);}
        .stat-sub{font-size:11.5px;color:var(--muted);margin-top:-4px;}
        .stat-card.is-link{cursor:pointer;}
        .stat-card.is-link:hover{border-color:var(--gold);}
        .stat-label{font-size:12.5px;color:var(--muted);}
        .panel{background:#fffdf8;border:1px solid var(--line);border-radius:16px;padding:22px;}
        .panel-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;}
        .panel-title{font-family:'Aref Ruqaa',serif;font-size:18px;color:var(--ink-teal);}
        .panel-badge{background:var(--parchment-dim);border-radius:999px;padding:5px 14px;font-size:12px;font-weight:700;color:var(--ink-teal);}
        .tbl-head,.tbl-row{display:grid;grid-template-columns:1.3fr 1.6fr .8fr .7fr;gap:12px;padding:12px 8px;font-size:13px;align-items:center;}
        .tbl-head{font-size:11.5px;color:var(--muted);font-weight:700;border-bottom:1px solid var(--line);padding-bottom:8px;}
        .tbl-row{border-bottom:1px solid var(--line);}
        .tbl-row:last-child{border-bottom:none;}
        .t-user{min-width:0;}
        .t-user b{display:block;color:var(--text-dark);font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
        .t-user span{display:block;font-size:11px;color:var(--muted);direction:ltr;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
        .t-course{color:var(--text-dark);font-size:12.5px;}
        .t-status{justify-self:start;border-radius:999px;padding:4px 12px;font-size:11.5px;font-weight:700;}
        .st-ok{background:rgba(46,139,87,.12);color:#1f6b41;}
        .st-no{background:rgba(178,58,46,.1);color:#8c2a20;}
        .st-pending{background:rgba(227,162,60,.18);color:#7a5612;}
        .panel-link{background:none;border:0;cursor:pointer;font-family:inherit;font-size:12.5px;font-weight:700;color:var(--ink-teal);text-decoration:underline;}
        .t-date{color:var(--muted);}
        .empty{color:#9a918a;font-size:13.5px;text-align:center;padding:26px 0;}
        @media(max-width:1100px){.cards-grid{grid-template-columns:repeat(3,1fr);}}
        @media(max-width:900px){.cards-grid{grid-template-columns:repeat(2,1fr);}}
        @media(max-width:560px){.cards-grid{grid-template-columns:1fr;} .tbl-head,.tbl-row{grid-template-columns:1fr 1fr;} .dash-hero{flex-direction:column;align-items:flex-start;}}
      `}</style>

      <div className="dash-hero">
        <div>
          <h2 className="dash-hero-title">لوحة تحكم المخ التعليمية</h2>
          <p className="dash-hero-sub">تابع أداء المنصة وإدارة المحتوى والوصول من مكان واحد</p>
        </div>
        <span className="dash-hero-chip">✓ النظام يعمل</span>
      </div>

      <div className="cards-grid">
        {cards.map((c) => (
          <div
            className={'stat-card' + (c.to ? ' is-link' : '')}
            key={c.label}
            onClick={c.to ? () => navigate(c.to) : undefined}
            role={c.to ? 'button' : undefined}
            tabIndex={c.to ? 0 : undefined}
            onKeyDown={c.to ? (e) => { if (e.key === 'Enter') navigate(c.to); } : undefined}
          >
            <div className={'stat-icon ' + c.tone}>{c.icon}</div>
            <div className="stat-value">{loading ? '...' : c.value}</div>
            <div className="stat-label">{c.label}</div>
            {c.sub && <div className="stat-sub">{loading ? '' : c.sub}</div>}
          </div>
        ))}
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2 className="panel-title">آخر طلبات الوصول</h2>
          <button type="button" className="panel-link" onClick={() => navigate('/access')}>عرض الكل ←</button>
        </div>
        <div className="tbl-head">
          <span>الطالب</span><span>النطاق</span><span>الحالة</span><span>التاريخ</span>
        </div>
        {loading ? (
          <div className="empty">...جارٍ التحميل</div>
        ) : recentRequests.length === 0 ? (
          <div className="empty">لا توجد طلبات بعد</div>
        ) : (
          recentRequests.map((r) => {
            const st = STATUS[r.status] || { label: r.status || '—', cls: 'st-pending' };
            return (
              <div className="tbl-row" key={r.id}>
                <div className="t-user"><b>{r.name || '—'}</b><span>{r.email || ''}</span></div>
                <span className="t-course">{scopeLabel(r)}</span>
                <span className={'t-status ' + st.cls}>{st.label}</span>
                <span className="t-date">{fmtDate(r.createdAt)}</span>
              </div>
            );
          })
        )}
      </div>
    </AdminLayout>
  );
}
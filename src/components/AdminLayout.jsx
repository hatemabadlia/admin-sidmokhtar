// src/components/AdminLayout.jsx — هيكل لوحة التحكم مع الشريط الجانبي
import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase/config';

const NAV = [
  { path: '/dashboard', label: 'الرئيسية', icon: '🏠' },
  { path: '/users', label: 'المستخدمون', icon: '👥' },
    { path: '/lessons/upload', label: 'رفع درس', icon: '📤' },
  { path: '/lessons/manage', label: 'إدارة الدروس', icon: '📚' },
  { path: '/exams/upload', label: 'رفع امتحان (PDF)', icon: '📄' },
  { path: '/exams/manage', label: 'إدارة الامتحانات', icon: '🗂️' },
  { path: '/quizzes', label: 'الاختبارات التفاعلية', icon: '🧠' },
  { path: '/live', label: 'الحصص المباشرة', icon: '🔴' },
  { path: '/access', label: 'إدارة الوصول', icon: '🔑' },
  { path: '/revenue', label: 'الإيرادات', icon: '💰' },
];

export default function AdminLayout({ title, subtitle, children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  const isActive = (item) =>
    item.path === '/dashboard'
      ? location.pathname === '/dashboard'
      : location.pathname.startsWith(item.path);

  const go = (path) => { navigate(path); setOpen(false); };

  const logout = async () => { await signOut(auth); navigate('/login'); };

  return (
    <div dir="rtl" style={{ fontFamily: "'IBM Plex Sans Arabic', sans-serif" }}>
      <style>{`
        :root{--ink-teal:#0E3B36;--ink-teal-deep:#092824;--parchment:#F6EEDC;--parchment-dim:#EFE3C8;--gold:#E3A23C;--gold-bright:#F0B85C;--text-dark:#1C1A15;--muted:#6b675c;--line:rgba(28,26,21,0.1);}
        *{margin:0;padding:0;box-sizing:border-box;}
        body{background:#f2efe7;}
        .al-side{
          position:fixed;top:0;right:0;bottom:0;width:268px;z-index:70;
          background:linear-gradient(180deg,#0E3B36 0%,#092824 55%,#071f1c 100%);
          color:var(--parchment);display:flex;flex-direction:column;transition:transform .28s ease;
          box-shadow:0 0 40px rgba(0,0,0,.25);
        }
        .al-side::before{content:'';position:absolute;inset:0;pointer-events:none;background:radial-gradient(circle at 20% 0%,rgba(227,162,60,.12),transparent 55%);}
        .al-brand{display:flex;align-items:center;gap:12px;padding:22px 20px 20px;border-bottom:1px solid rgba(246,238,220,.08);position:relative;}
        .al-logo{width:44px;height:44px;border-radius:14px;background:linear-gradient(135deg,var(--gold),#F0B85C);color:var(--ink-teal-deep);display:flex;align-items:center;justify-content:center;font-family:'Aref Ruqaa',serif;font-size:22px;font-weight:700;box-shadow:0 6px 16px rgba(227,162,60,.35);}
        .al-brand-title{display:block;font-family:'Aref Ruqaa',serif;font-size:17px;}
        .al-brand-sub{display:block;font-size:11px;color:rgba(246,238,220,.55);margin-top:2px;}
        .al-nav{flex:1;overflow-y:auto;padding:18px 14px;position:relative;}
        .al-nav-label{font-size:11px;letter-spacing:1px;color:rgba(246,238,220,.4);margin:0 10px 10px;text-transform:uppercase;}
        .al-nav-item{
          width:100%;display:flex;align-items:center;gap:12px;background:transparent;border:0;color:rgba(246,238,220,.72);
          font-family:inherit;font-size:14px;font-weight:600;padding:12px 14px;border-radius:12px;cursor:pointer;margin-bottom:4px;text-align:right;transition:all .18s;
        }
        .al-nav-item:hover{background:rgba(246,238,220,.08);color:var(--parchment);transform:translateX(-2px);}
        .al-nav-item.al-active{background:linear-gradient(90deg,rgba(227,162,60,.22),rgba(227,162,60,.08));color:#fff;box-shadow:inset 3px 0 0 var(--gold);}
        .al-nav-icon{font-size:17px;width:26px;text-align:center;}
        .al-side-footer{padding:16px;border-top:1px solid rgba(246,238,220,.08);position:relative;}
        .al-logout{width:100%;display:flex;align-items:center;gap:10px;justify-content:center;background:rgba(178,58,46,.16);border:1px solid rgba(178,58,46,.35);color:#f3b3ac;font-family:inherit;font-size:13.5px;font-weight:700;padding:12px;border-radius:12px;cursor:pointer;transition:all .2s;}
        .al-logout:hover{background:rgba(178,58,46,.3);color:#fff;}
        .al-main{margin-right:268px;min-height:100svh;display:flex;flex-direction:column;}
        .al-topbar{
          position:sticky;top:0;z-index:40;display:flex;align-items:center;justify-content:space-between;gap:12px;
          background:rgba(246,244,237,.92);backdrop-filter:blur(8px);border-bottom:1px solid var(--line);padding:16px 28px;
        }
        .al-burger{display:none;border:1px solid var(--line);background:#fff;border-radius:10px;width:40px;height:40px;font-size:18px;cursor:pointer;}
        .al-page-title{font-family:'Aref Ruqaa',serif;font-size:22px;color:var(--ink-teal);}
        .al-page-sub{font-size:12.5px;color:var(--muted);margin-top:2px;}
        .al-top-actions{display:flex;align-items:center;gap:10px;}
        .al-avatar{width:38px;height:38px;border-radius:50%;background:var(--ink-teal);color:var(--parchment);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:15px;}
        .al-user{font-size:13.5px;font-weight:700;color:var(--text-dark);}
        .al-overlay{position:fixed;inset:0;background:rgba(7,31,28,.5);z-index:60;}
        .al-content{padding:28px;flex:1;}
        @media(max-width:860px){
          .al-side{transform:translateX(100%);width:268px;}
          .al-side.al-side-open{transform:translateX(0);}
          .al-main{margin-right:0;}
          .al-burger{display:inline-flex;align-items:center;justify-content:center;}
          .al-content{padding:20px;}
        }
      `}</style>
{open && <div className="al-overlay" onClick={() => setOpen(false)} />}

      <aside className={'al-side' + (open ? ' al-side-open' : '')}>
        <div className="al-brand">
          <div className="al-logo">م</div>
          <div>
            <span className="al-brand-title">لوحة تحكم المخ</span>
            <span className="al-brand-sub">الإدارة التعليمية</span>
          </div>
        </div>
        <nav className="al-nav">
          <p className="al-nav-label">القائمة الرئيسية</p>
          {NAV.map((n) => (
            <button key={n.path} className={'al-nav-item' + (isActive(n) ? ' al-active' : '')} onClick={() => go(n.path)}>
              <span className="al-nav-icon">{n.icon}</span>
              <span>{n.label}</span>
            </button>
          ))}
        </nav>
        <div className="al-side-footer">
          <button className="al-logout" onClick={logout}>🚪 تسجيل الخروج</button>
        </div>
      </aside>

      <div className="al-main">
        <header className="al-topbar">
          <button className="al-burger" onClick={() => setOpen(true)}>☰</button>
          <div>
            <h1 className="al-page-title">{title}</h1>
            {subtitle && <p className="al-page-sub">{subtitle}</p>}
          </div>
          <div className="al-top-actions">
            <span className="al-avatar">أ</span>
            <span className="al-user">المشرف</span>
          </div>
        </header>
        <div className="al-content">{children}</div>
      </div>
    </div>
  );
}
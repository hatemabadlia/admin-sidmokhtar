// src/components/AdminRoute.jsx
import React, { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase/config';

export default function AdminRoute({ children }) {
  const navigate = useNavigate();
  const [status, setStatus] = useState('checking'); // 'checking' | 'allowed' | 'denied' | 'error'
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        if (!cancelled) setStatus('denied');
        return;
      }
      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        if (cancelled) return;
        const role = snap.exists() ? snap.data().role : null;
        setStatus(role === 'admin' ? 'allowed' : 'denied');
      } catch (err) {
        console.error('AdminRoute: getDoc threw', err);
        if (!cancelled) {
          setError(String(err?.message || err));
          setStatus('error');
        }
      }
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  if (status === 'checking') {
    return (
      <div
        style={{
          minHeight: '100svh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0E3B36',
        }}
      >
        <span style={{ color: '#F6EEDC', fontFamily: "'IBM Plex Sans Arabic', sans-serif" }}>
          ...جارٍ التحقق
        </span>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div
        style={{
          minHeight: '100svh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0E3B36',
          padding: 24,
        }}
      >
        <div
          style={{
            maxWidth: 420,
            background: '#F6EEDC',
            borderRadius: 16,
            padding: 28,
            fontFamily: "'IBM Plex Sans Arabic', sans-serif",
            color: '#1C1A15',
            direction: 'rtl',
          }}
        >
          <h2 style={{ marginBottom: 12 }}>تعذّر التحقق من الصلاحيات</h2>
          <p style={{ fontSize: 14, lineHeight: 1.8, marginBottom: 10 }}>
            تعذّرت قراءة مستند المستخدم من Firestore. تأكد من أن:
          </p>
          <ul style={{ fontSize: 13, lineHeight: 2, margin: '0 0 16px', paddingInlineStart: 18 }}>
            <li>معرّف حساب Auth يطابق معرّف مستند users.</li>
            <li>قواعد Firestore تسمح بقراءة المستند.</li>
          </ul>
          <p style={{ fontSize: 12, color: '#8c2a20', marginBottom: 16, wordBreak: 'break-word' }}>
            {error}
          </p>
          <button
            onClick={() => signOut(auth).then(() => navigate('/login', { replace: true }))}
            style={{
              width: '100%',
              border: 0,
              borderRadius: 12,
              background: '#0E3B36',
              color: '#F6EEDC',
              fontFamily: 'inherit',
              fontWeight: 700,
              fontSize: 14,
              padding: '12px 0',
              cursor: 'pointer',
            }}
          >
            العودة لتسجيل الدخول
          </button>
        </div>
      </div>
    );
  }

  if (status === 'denied') {
    return <Navigate to="/login" replace />;
  }

  return children;
}
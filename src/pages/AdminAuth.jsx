import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  onAuthStateChanged,
  signOut,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase/config';

const toError = (code) => {
  const map = {
    'auth/invalid-email': 'البريد الإلكتروني غير صحيح.',
    'auth/user-not-found': 'لا يوجد حساب بهذا البريد الإلكتروني.',
    'auth/wrong-password': 'كلمة المرور غير صحيحة.',
    'auth/invalid-credential': 'بيانات الدخول غير صحيحة.',
    'auth/too-many-requests': 'طلبات كثيرة جدًا — حاول بعد قليل.',
    'auth/network-request-failed': 'تعذّر الاتصال — تأكد من اتصالك بالإنترنت.',
  };
  return map[code] || 'حدث خطأ غير متوقع، حاول مجددًا.';
};

export default function AdminAuth() {
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);

  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  // If an admin session already exists, skip straight to the panel.
  // If a non-admin session exists, sign them out silently.
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setCheckingSession(false);
        return;
      }
      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        const role = snap.exists() ? snap.data().role : null;
        if (role === 'admin') {
          navigate('/dashboard', { replace: true });
        } else {
          await signOut(auth);
          setCheckingSession(false);
        }
      } catch (err) {
        console.error('[AdminAuth] فشل التحقق من صلاحيات الجلسة:', err);
        await signOut(auth);
        setCheckingSession(false);
        setError('تعذّر التحقق من الحساب — تأكد من قواعد Firestore ومن وجود مستند المستخدم بالمعرّف الصحيح.');
      }
    });
    return unsub;
  }, [navigate]);

  const validate = () => {
    if (!email.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setError('من فضلك أدخل بريدًا إلكترونيًا صحيحًا.');
      return false;
    }
    if (password.length < 6) {
      setError('كلمة المرور يجب أن تكون 6 أحرف أو أكثر.');
      return false;
    }
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setInfo('');
    if (!validate()) return;

    setLoading(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, email.trim(), password);

      let role = null;
      try {
        const snap = await getDoc(doc(db, 'users', cred.user.uid));
        role = snap.exists() ? snap.data().role : null;
      } catch (roleErr) {
        console.error('[AdminAuth] فشل قراءة مستند المستخدم:', roleErr);
        await signOut(auth);
        setError('لا يمكن قراءة الصلاحيات من قاعدة البيانات — تأكد من قواعد Firestore وأن معرّف مستخدم Auth يطابق معرّف مستند users.');
        return;
      }

      if (role !== 'admin') {
        await signOut(auth);
        setError('هذا الحساب لا يملك صلاحيات الإدارة.');
        return;
      }

      navigate('/dashboard', { replace: true });
    } catch (err) {
      console.error('[signInWithEmailAndPassword failed]', err);
      setError(toError(err.code));
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    if (!email.trim()) {
      setError('أدخل بريدك الإلكتروني أولًا لاستعادة كلمة المرور.');
      return;
    }
    setError('');
    setInfo('');
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setInfo('تم إرسال رابط استعادة كلمة المرور إلى بريدك.');
    } catch (err) {
      console.error('[sendPasswordResetEmail failed]', err);
      setError(toError(err.code));
    } finally {
      setLoading(false);
    }
  };

  if (checkingSession) {
    return (
      <div style={{ minHeight: '100svh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0E3B36' }}>
        <span style={{ color: '#F6EEDC', fontFamily: "'IBM Plex Sans Arabic', sans-serif" }}>...جارٍ التحقق</span>
      </div>
    );
  }

  return (
    <div dir="rtl" style={{ fontFamily: "'IBM Plex Sans Arabic', sans-serif" }}>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="true" />
      <link
        href="https://fonts.googleapis.com/css2?family=Aref+Ruqaa:wght@400;700&family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap"
        rel="stylesheet"
      />
      <style>{`
      :root{
        --ink-teal:#0E3B36;
        --ink-teal-deep:#092824;
        --parchment:#F6EEDC;
        --parchment-dim:#EFE3C8;
        --gold:#E3A23C;
        --gold-bright:#F0B85C;
        --crimson:#B23A2E;
        --text-dark:#1C1A15;
        --line:rgba(28,26,21,0.14);
      }
      *{margin:0;padding:0;box-sizing:border-box;}
      body{background:var(--ink-teal-deep); color:var(--text-dark);}

      .admin-auth-page{
        min-height:100svh; display:flex; align-items:center; justify-content:center;
        background:linear-gradient(150deg, var(--ink-teal-deep) 0%, var(--ink-teal) 60%, #14534C 100%);
        position:relative; overflow:hidden; padding:24px;
      }
      .admin-auth-page::before{
        content:''; position:absolute; inset:0;
        background:
          radial-gradient(ellipse 620px 460px at 85% 12%, rgba(227,162,60,0.14), transparent 60%),
          radial-gradient(ellipse 500px 420px at 8% 92%, rgba(178,58,46,0.12), transparent 60%);
        pointer-events:none;
      }

      .admin-card{
        position:relative; z-index:2; width:100%; max-width:420px;
        background:var(--parchment); border-radius:20px; padding:44px 36px;
        box-shadow:0 30px 70px rgba(0,0,0,0.35);
      }

      .admin-badge{
        display:flex; align-items:center; justify-content:center; gap:10px; margin-bottom:26px;
      }
      .logo-mark{
        width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;
        background:var(--ink-teal);color:var(--parchment);
        font-family:'Aref Ruqaa',serif;font-size:20px;font-weight:700;border:2px solid var(--gold);
      }
      .admin-badge-text{font-family:'Aref Ruqaa',serif;font-size:22px;font-weight:700;color:var(--ink-teal);}

      .card-head{text-align:center;margin-bottom:28px;}
      .card-head h2{font-family:'Aref Ruqaa',serif;font-size:26px;color:var(--ink-teal);margin-bottom:6px;}
      .card-head p{font-size:13.5px;color:#5c584c;}

      .field{margin-bottom:18px;}
      .field label{display:block;font-size:13.5px;font-weight:600;margin-bottom:8px;color:var(--text-dark);}
      .input{
        position:relative;display:flex;align-items:center;gap:6px;
        background:#fffdf6;border:1.5px solid var(--line);border-radius:12px;
        padding:0 14px;transition:border-color .2s;
      }
      .input:focus-within{border-color:var(--gold);box-shadow:0 0 0 4px rgba(227,162,60,0.15);}
      .input .ii{color:var(--gold);font-size:15px;}
      .input input{
        flex:1;border:0;outline:0;background:transparent;
        font-family:'IBM Plex Sans Arabic',sans-serif;font-size:15px;
        padding:13px 4px;color:var(--text-dark);
      }
      .input input::placeholder{color:#9a9183;font-weight:300;}
      .eye{border:0;background:none;cursor:pointer;color:#9a9183;font-size:16px;padding:4px;line-height:1;}

      .row-end{display:flex;justify-content:flex-end;margin:2px 0 22px;}
      .link-btn{border:0;background:none;cursor:pointer;font-family:'IBM Plex Sans Arabic',sans-serif;font-size:13px;font-weight:600;color:var(--ink-teal);text-decoration:underline;text-underline-offset:3px;padding:0;}
      .link-btn:hover{color:var(--gold);}

      .btn-primary{
        width:100%;border:0;cursor:pointer;
        background:var(--ink-teal);color:var(--parchment);font-weight:700;font-size:16px;
        font-family:'IBM Plex Sans Arabic',sans-serif;padding:15px 0;border-radius:12px;
        transition:all .25s;box-shadow:0 8px 24px rgba(14,59,54,0.28);
      }
      .btn-primary:hover{background:var(--ink-teal-deep);transform:translateY(-2px);}
      .btn-primary:disabled{opacity:0.6;cursor:not-allowed;transform:none;}
      .spinner{display:inline-block;width:18px;height:18px;border:3px solid rgba(246,238,220,0.35);border-top-color:var(--parchment);border-radius:50%;animation:spin .7s linear infinite;vertical-align:middle;}
      @keyframes spin{to{transform:rotate(360deg);}}

      .message{border-radius:12px;padding:12px 16px;font-size:13.5px;margin-bottom:18px;line-height:1.6;text-align:right;}
      .message.error{background:rgba(178,58,46,0.08);border:1px solid rgba(178,58,46,0.3);color:#8c2a20;}
      .message.info{background:rgba(227,162,60,0.12);border:1px solid rgba(227,162,60,0.4);color:#7a5612;}

      .restricted-note{text-align:center;margin-top:22px;font-size:12px;color:#9a918a;}
      `}</style>

      <div className="admin-auth-page">
        <div className="admin-card">
          <div className="admin-badge">
            <div className="logo-mark">م</div>
            <div className="admin-badge-text">لوحة تحكم المخ</div>
          </div>

          <div className="card-head">
            <h2>دخول المشرفين</h2>
            <p>هذه اللوحة مخصصة للإدارة فقط</p>
          </div>

          {error && <div className="message error">{error}</div>}
          {info && <div className="message info">{info}</div>}

          <form onSubmit={handleSubmit} noValidate>
            <div className="field">
              <label>البريد الإلكتروني</label>
              <div className="input">
                <span className="ii">✉</span>
                <input type="email" dir="ltr" placeholder="admin@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
            </div>

            <div className="field">
              <label>كلمة المرور</label>
              <div className="input">
                <span className="ii">🔒</span>
                <input type={showPw ? 'text' : 'password'} dir="ltr" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} />
                <button type="button" className="eye" onClick={() => setShowPw((s) => !s)}>
                  {showPw ? '🙈' : '👁'}
                </button>
              </div>
            </div>

            <div className="row-end">
              <button type="button" className="link-btn" onClick={handleReset}>
                نسيت كلمة المرور؟
              </button>
            </div>

            <button className="btn-primary" type="submit" disabled={loading}>
              {loading ? <span className="spinner" /> : 'تسجيل الدخول'}
            </button>
          </form>

          <p className="restricted-note">الوصول محصور على الحسابات المصرّح لها بصلاحيات الإدارة</p>
        </div>
      </div>
    </div>
  );
}
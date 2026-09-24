// src/lib/access.js — مشتركة: رموز/صلاحيات + تسميات
import { doc, getDoc } from 'firebase/firestore';

const ACCESS_KEY = 'almokh_access';
const LEGACY_ACCESS_KEY = 'najah_access';

export const getUnlocked = () =>
  typeof window !== 'undefined' &&
  (sessionStorage.getItem(ACCESS_KEY) === 'granted' ||
    sessionStorage.getItem(LEGACY_ACCESS_KEY) === 'granted');

export const grantAccess = () => {
  if (typeof window !== 'undefined') sessionStorage.setItem(ACCESS_KEY, 'granted');
};

export const LEVELS = [
  { value: '4am', label: 'الرابعة متوسط (BEM)' },
  { value: '1as', label: 'الأولى ثانوي' },
  { value: '2as', label: 'الثانية ثانوي' },
  { value: 'bac', label: 'البكالوريا (الثالثة ثانوي)' },
];

export const MODULES = [
  { value: 'math', label: 'رياضيات' },
  { value: 'physics', label: 'فيزياء' },
];

export const levelLabel = (v) => LEVELS.find((l) => l.value === v)?.label || v || '—';
export const moduleLabel = (v) => MODULES.find((m) => m.value === v)?.label || v || '—';

export const tsToMs = (v) => {
  if (!v) return null;
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (typeof v.seconds === 'number') return v.seconds * 1000;
  if (v instanceof Date) return v.getTime();
  return null;
};

export const fmtDate = (v) => {
  const ms = tsToMs(v);
  if (!ms) return '-';
  try { return new Date(ms).toLocaleDateString('ar-DZ'); } catch { return '-'; }
};

// التحقق من رمز الدخول: قراءة مستند محدد فقط (لا يمكن سرد الرموز)
export const validateCode = async (code, firestoreDb) => {
  const snap = await getDoc(doc(firestoreDb, 'accessCodes', code));
  if (!snap.exists()) return false;
  const d = snap.data();
  const exp = tsToMs(d.expiresAt);
  return d.active === true && (!exp || exp > Date.now());
};
/** رقم جزائري (0550…) → صيغة wa.me الدولية (213550…). يقبل +213/00213 أيضًا. */
export const waNumber = (phone) => {
  const d = String(phone || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('00213')) return d.slice(2);
  if (d.startsWith('213')) return d;
  if (d.startsWith('0')) return '213' + d.slice(1);
  return d;
};

/** رابط محادثة واتساب مع نص جاهز. */
export const waLink = (phone, text = '') => {
  const n = waNumber(phone);
  if (!n) return '';
  return `https://wa.me/${n}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
};

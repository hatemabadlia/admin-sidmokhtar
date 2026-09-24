// src/lib/sales.js — سجلّ المبيعات والإيرادات
//
// البيع يُسجَّل لحظة تأكيد الدفع (وصل CCP / BaridiMob)، لا لحظة استعمال الرمز —
// المال وصل فعلًا حتى لو لم يفعّل الطالب رمزه بعد. ونتتبّع التفعيل بحقل
// منفصل حتى تظهر قائمة «دفعوا ولم يفعّلوا» لمتابعتهم.
//
// Firestore: sales/{saleId}
//   code        رمز الوصول المرتبط بالبيع (المعرّف الرابط مع accessCodes)
//   amount      المبلغ المقبوض فعلًا
//   listPrice   سعر القائمة وقت البيع (للفرق/التخفيض)
//   level, module ('math'|'physics'|'both'), scope ('module'|'trimester'|'unit'), group
//   student     { name, phone, uid }
//   method      'ccp' | 'baridimob' | 'cash' | 'other'
//   note
//   paidAt      وقت قبض المال (يُحدَّده المشرف — قد يكون بالأمس)
//   createdAt   وقت التسجيل في اللوحة
//   redeemed    هل فُعِّل الرمز؟ · redeemedAt

import {
  collection,
  doc,
  setDoc,
  getDocs,
  query,
  orderBy,
  serverTimestamp,
  deleteDoc,
  updateDoc,
} from 'firebase/firestore';
import { tsToMs } from './access';

export const PAYMENT_METHODS = [
  { value: 'ccp', label: 'CCP' },
  { value: 'baridimob', label: 'BaridiMob' },
  { value: 'cash', label: 'نقدًا' },
  { value: 'other', label: 'أخرى' },
];

export const methodLabel = (v) =>
  PAYMENT_METHODS.find((m) => m.value === v)?.label || v || '—';

/**
 * تسجيل بيع. المعرّف هو الرمز نفسه حين وُجد — فلا يُسجَّل نفس الرمز مرتين
 * بالخطأ (نقرتان على «حفظ» تكتبان نفس الوثيقة بدل بيعين وهميين).
 */
export async function recordSale(db, sale) {
  const id = sale.code ? String(sale.code).toUpperCase() : doc(collection(db, 'sales')).id;
  const payload = {
    code: sale.code ? String(sale.code).toUpperCase() : null,
    amount: Math.max(0, Number(sale.amount) || 0),
    listPrice: sale.listPrice == null ? null : Number(sale.listPrice),
    level: sale.level || '',
    module: sale.module || '',
    scope: sale.scope || 'module',
    group: sale.group || '',
    student: {
      name: (sale.student?.name || '').trim(),
      phone: (sale.student?.phone || '').replace(/\s+/g, ''),
      uid: sale.student?.uid || null,
    },
    method: sale.method || 'other',
    note: (sale.note || '').trim() || null,
    paidAt: sale.paidAt instanceof Date ? sale.paidAt : new Date(),
    createdAt: serverTimestamp(),
    redeemed: false,
    redeemedAt: null,
  };
  await setDoc(doc(db, 'sales', id), payload, { merge: true });
  return id;
}

export async function deleteSale(db, id) {
  await deleteDoc(doc(db, 'sales', id));
}

export async function updateSale(db, id, patch) {
  await updateDoc(doc(db, 'sales', id), patch);
}

/** كل المبيعات، الأحدث أولًا حسب وقت الدفع. */
export async function fetchSales(db) {
  const snap = await getDocs(query(collection(db, 'sales'), orderBy('paidAt', 'desc')));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * مطابقة كل بيع مع رمزه لمعرفة هل فُعِّل.
 * الرمز مفعَّل متى استعمله طالب واحد على الأقل (usedBy غير فارغة).
 * نحسبها عند العرض بدل تخزين حالة تتقادم بصمت.
 */
export function markRedeemed(sales, codes) {
  const byCode = new Map(codes.map((c) => [String(c.id).toUpperCase(), c]));
  return sales.map((s) => {
    const c = s.code ? byCode.get(String(s.code).toUpperCase()) : null;
    const usedBy = Array.isArray(c?.usedBy) ? c.usedBy : [];
    return {
      ...s,
      codeExists: Boolean(c),
      codeActive: c?.active === true,
      redeemed: usedBy.length > 0,
      redeemedCount: usedBy.length,
    };
  });
}

const startOfDay = (ms) => { const d = new Date(ms); d.setHours(0,0,0,0); return d.getTime(); };

/** بداية الشهر الحالي. */
export const startOfMonth = (now = Date.now()) => {
  const d = new Date(now);
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
};

/**
 * ملخّص الإيرادات على مدى زمني.
 * كل المبالغ من حقل amount (المقبوض فعلًا) — لا من قائمة الأسعار.
 */
export function summarize(sales, now = Date.now()) {
  const today = startOfDay(now);
  const month = startOfMonth(now);
  const last30 = now - 30 * 86400000;

  const at = (s) => tsToMs(s.paidAt) || 0;
  const sum = (list) => list.reduce((t, s) => t + (Number(s.amount) || 0), 0);

  const todaySales = sales.filter((s) => at(s) >= today);
  const monthSales = sales.filter((s) => at(s) >= month);
  const recentSales = sales.filter((s) => at(s) >= last30);
  const unredeemed = sales.filter((s) => !s.redeemed);

  return {
    total: sum(sales),
    count: sales.length,
    today: sum(todaySales),
    todayCount: todaySales.length,
    month: sum(monthSales),
    monthCount: monthSales.length,
    last30: sum(recentSales),
    avg: sales.length ? Math.round(sum(sales) / sales.length) : 0,
    unredeemedAmount: sum(unredeemed),
    unredeemedCount: unredeemed.length,
    discounted: sales.filter(
      (s) => s.listPrice != null && Number(s.amount) < Number(s.listPrice)
    ).length,
  };
}

/** إيراد كل شهر للأشهر n الأخيرة — للرسم البياني (الأقدم أولًا). */
export function monthlySeries(sales, months = 6, now = Date.now()) {
  const out = [];
  const base = new Date(now);
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
    const from = d.getTime();
    const to = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
    const inRange = sales.filter((s) => {
      const ms = tsToMs(s.paidAt) || 0;
      return ms >= from && ms < to;
    });
    out.push({
      key: `${d.getFullYear()}-${d.getMonth() + 1}`,
      label: d.toLocaleDateString('ar-DZ', { month: 'short' }),
      total: inRange.reduce((t, s) => t + (Number(s.amount) || 0), 0),
      count: inRange.length,
    });
  }
  return out;
}

/** تجميع الإيراد حسب حقل (مستوى/مادة) — لمعرفة ما الذي يبيع فعلًا. */
export function groupRevenue(sales, field) {
  const map = new Map();
  for (const s of sales) {
    const k = s[field] || '—';
    const prev = map.get(k) || { total: 0, count: 0 };
    map.set(k, { total: prev.total + (Number(s.amount) || 0), count: prev.count + 1 });
  }
  return Array.from(map.entries())
    .map(([key, v]) => ({ key, ...v }))
    .sort((a, b) => b.total - a.total);
}

/**
 * نطاق الرمز كما تفهمه قائمة الأسعار ووثيقة البيع.
 * رمز بـ modules طوله > 1 هو «العرض الكامل» (both).
 */
export function offerOfCode(c) {
  const isBundle = Array.isArray(c?.modules) && c.modules.length > 1;
  const scope = c?.unit ? 'unit' : c?.trimester ? 'trimester' : 'module';
  return {
    level: c?.level || '',
    module: isBundle ? 'both' : (c?.module || ''),
    scope,
    group: c?.unit || c?.trimester || '',
  };
}

/**
 * رموز أُنشئت بلا بيع مسجَّل — الرموز المولَّدة من «اعتماد طلب» أو من مولّد
 * «المادة كاملة» لا تمرّ على نموذج البيع، فكان دخلها يسقط من التقارير بصمت.
 * هذه القائمة تجعل كل رمز قابلًا للتسجيل لاحقًا بنقرة.
 */
export function codesWithoutSale(codes, sales) {
  const sold = new Set(sales.map((s) => String(s.code || '').toUpperCase()).filter(Boolean));
  return codes
    .filter((c) => !sold.has(String(c.id).toUpperCase()))
    .map((c) => ({ ...c, offer: offerOfCode(c) }))
    .sort((a, b) => (tsToMs(b.createdAt) || 0) - (tsToMs(a.createdAt) || 0));
}

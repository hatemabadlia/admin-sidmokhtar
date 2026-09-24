// src/lib/pricing.js — قائمة أسعار العروض (مصدر واحد للحقيقة)
//
// السعر يُحدَّد مرة واحدة لكل «عرض» = مستوى + مادة (أو المادتين معًا) + نطاق،
// ثم يُطبَّق تلقائيًا عند تسجيل أي بيع. أي تخفيض يُكتب يدويًا وقت البيع
// ويُحفظ في وثيقة البيع مع السعر الأصلي، فيبقى الفرق ظاهرًا في التقارير.
//
// التخزين: settings/pricing  →  { prices: { [offerKey]: number }, currency, updatedAt }

import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { LEVELS, MODULES, levelLabel, moduleLabel } from './access';

export const CURRENCY = 'DZD';
export const PRICING_DOC = ['settings', 'pricing'];

/** «المادتان معًا» تُعامَل كمادة افتراضية في قائمة الأسعار وفي وثائق البيع. */
export const BUNDLE = 'both';

export const MODULE_CHOICES = [
  ...MODULES,
  { value: BUNDLE, label: 'رياضيات + فيزياء (العرض الكامل)' },
];

export const SCOPES = [
  { value: 'module', label: 'المادة كاملة' },
  { value: 'trimester', label: 'فصل واحد' },
  { value: 'unit', label: 'وحدة واحدة' },
];

export const TRIMESTER_LABELS = { t1: 'الفصل الأول', t2: 'الفصل الثاني', t3: 'الفصل الثالث' };

/**
 * مفتاح العرض في قائمة الأسعار: level__module__scope
 * لا يتضمّن اسم الوحدة أو رقم الفصل — كل الوحدات بنفس السعر داخل المستوى،
 * وإلا صارت القائمة عشرات الأسطر التي لا أحد يحدّثها.
 */
export const offerKey = (level, module, scope) => `${level}__${module}__${scope}`;

export const offerLabel = (level, module, scope) => {
  const scopeText = SCOPES.find((s) => s.value === scope)?.label || scope;
  return `${levelLabel(level)} · ${moduleLabelOrBundle(module)} · ${scopeText}`;
};

export const moduleLabelOrBundle = (m) =>
  m === BUNDLE ? 'رياضيات + فيزياء' : moduleLabel(m);

/** البكالوريا تُنظَّم بالوحدات، وبقية المستويات بالفصول — لا نعرض ما لا يُستعمل. */
export const scopesForLevel = (level) =>
  SCOPES.filter((s) => (level === 'bac' ? s.value !== 'trimester' : s.value !== 'unit'));

/** كل صفوف قائمة الأسعار الممكنة — أساس محرّر الأسعار. */
export function allOffers() {
  const rows = [];
  for (const lv of LEVELS) {
    for (const m of MODULE_CHOICES) {
      for (const sc of scopesForLevel(lv.value)) {
        rows.push({
          key: offerKey(lv.value, m.value, sc.value),
          level: lv.value,
          module: m.value,
          scope: sc.value,
          label: offerLabel(lv.value, m.value, sc.value),
        });
      }
    }
  }
  return rows;
}

/**
 * أسعار صفحة «الأسعار» في الموقع (LmokhLanding.jsx) — المصدر المعلَن للطالب.
 * تُستعمل كقيم افتراضية هنا حتى لا تُدخَل يدويًا، ويبقى الحفظ في Firestore
 * هو الذي يتجاوزها عند أي تغيير.
 *
 * ⚠️ نسخة يدوية: الموقع مشروع منفصل، فتغيير سعر هناك يستلزم تحديثه هنا.
 *
 * التحقّق من القراءة: أسعار «العرض الكامل» في الموقع تحمل سعرًا مشطوبًا يساوي
 * مجموع المادتين بالضبط (البوكس الألماسي BEM: 14000 بدل 17000 = 10000+7000،
 * والبكالوريا: 20000 بدل 30000 = 15000+15000) — فـ«كل الوحدات/السنة كاملة»
 * سعرُ مادةٍ واحدة، و«المادتين» هو العرض المجمّع.
 */
export const LANDING_PRICES = {
  // الرابعة متوسط (BEM) — بطاقة «الرابعة متوسط» + البوكس الألماسي BEM
  '4am__math__trimester': 4500,
  '4am__math__module': 10000,
  '4am__physics__trimester': 3500,
  '4am__physics__module': 7000,
  '4am__both__module': 14000,

  // الأولى/الثانية ثانوي — «البوكس الذهبي» (يفتح المادتين معًا)
  '1as__both__trimester': 5000,
  '1as__both__module': 10000,
  '2as__both__trimester': 5000,
  '2as__both__module': 10000,

  // البكالوريا — بطاقتا BAC + البوكس الألماسي «فيزياء و رياضيات»
  'bac__math__unit': 3000,
  'bac__physics__unit': 3000,
  'bac__math__module': 15000,
  'bac__physics__module': 15000,
  'bac__both__module': 20000,

  // غير معلنة في الموقع (تُترك فارغة عمدًا فيطالب النموذج بالمبلغ يدويًا
  // بدل تخمين سعر خاطئ): 4am__both__trimester · bac__both__unit ·
  // كل أسعار المادة الواحدة في 1as و 2as.
};

/** قراءة قائمة الأسعار — المحفوظ في Firestore يتقدّم على أسعار الموقع. */
export async function fetchPricing(db) {
  try {
    const snap = await getDoc(doc(db, ...PRICING_DOC));
    const saved = snap.exists() ? (snap.data()?.prices || {}) : {};
    return {
      saved,
      prices: { ...LANDING_PRICES, ...saved },
      defaults: LANDING_PRICES,
      currency: CURRENCY,
    };
  } catch {
    // بلا اتصال أو صلاحيات — أسعار الموقع أفضل من لا شيء
    return { saved: {}, prices: { ...LANDING_PRICES }, defaults: LANDING_PRICES, currency: CURRENCY };
  }
}

export async function savePricing(db, prices) {
  await setDoc(
    doc(db, ...PRICING_DOC),
    { prices, currency: CURRENCY, updatedAt: serverTimestamp() },
    { merge: true }
  );
}

/** سعر عرض معيّن، أو null إن لم يُسعَّر بعد (فيطالب النموذج بإدخاله يدويًا). */
export function priceFor(prices, level, module, scope) {
  const v = prices?.[offerKey(level, module, scope)];
  return Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null;
}

/** 2500 → «2٬500 دج» */
export function fmtMoney(n) {
  const v = Number(n) || 0;
  try {
    return `${v.toLocaleString('ar-DZ')} دج`;
  } catch {
    return `${v} دج`;
  }
}

// src/pages/AdminAccess.jsx — إدارة الوصول: الطلبات + رموز الدخول
import React, { useEffect, useState } from 'react';
import { collection, getDocs, query, orderBy, doc, updateDoc, setDoc, serverTimestamp, arrayUnion } from 'firebase/firestore';
import { db } from '../firebase/config';
import { levelLabel, moduleLabel, MODULES, LEVELS, fmtDate, waLink } from '../lib/access';
import AdminLayout from '../components/AdminLayout';
import { BUNDLE, fetchPricing, priceFor, fmtMoney, moduleLabelOrBundle } from '../lib/pricing';
import { recordSale, PAYMENT_METHODS } from '../lib/sales';

const TRIMESTERS = [
  { value: 't1', label: 'الفصل الأول' },
  { value: 't2', label: 'الفصل الثاني' },
  { value: 't3', label: 'الفصل الثالث' },
];

// كل رمز خاص بمادة واحدة بالضبط، ويمكن أن يكون:
// - 'module' : المادة كاملة (يفتح كل دروسها)
// - 'trimester' : فصل محدد (لغير البكالوريا)
// - 'unit' : وحدة محددة (للبكالوريا)
const genCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c = '';
  for (let i = 0; i < 6; i++) c += chars[Math.floor(Math.random() * chars.length)];
  return c;
};

const STATUS = {
  pending: { label: 'قيد الانتظار', cls: 'st-pending' },
  approved: { label: 'مقبول ✓', cls: 'st-approved' },
  rejected: { label: 'مرفوض', cls: 'st-rejected' },
};

// تسمية نطاق الرمز: المستوى · المادة · (فصل/وحدة أو «المادة كاملة»)
const scopeLabel = (c) => {
  if (!c.level && !c.module) return '';
  const m = Array.isArray(c.modules) && c.modules.length > 1 ? 'رياضيات + فيزياء' : moduleLabel(c.module);
  const group = c.level === 'bac'
    ? (c.unit ? ` · ${c.unit}` : '')
    : (c.trimester ? ` · ${TRIMESTERS.find((t) => t.value === c.trimester)?.label || c.trimester}` : '');
  return `${levelLabel(c.level)} · ${m}${group || ' · المادة كاملة'}`;
};

const isModuleRequest = (r) => r.scope === 'module' || (!r.unit && !r.trimester);
const requestScopeLabel = (r) => {
  const m = moduleLabel(r.module);
  const group = r.level === 'bac'
    ? (r.unit ? ` · ${r.unit}` : '')
    : (r.trimester ? ` · ${TRIMESTERS.find((t) => t.value === r.trimester)?.label || r.trimester}` : '');
  return `${levelLabel(r.level)} · ${m}${group || ' · المادة كاملة 🎁'}`;
};

// نص واتساب حسب حالة الطلب: قبل الموافقة (طلب إثبات الدفع) / بعدها (إرسال الرمز)
const waMessage = (r) => {
  const scope = requestScopeLabel(r);
  if (r.status === 'approved') {
    return [
      `السلام عليكم ${r.name || ''}،`,
      `تم تفعيل وصولك إلى: ${scope} على منصة المخ ✅`,
      r.code ? `رمز الدخول (احتياطي): ${r.code} — أدخله من «لدي رمز» إن لم يظهر القسم مفتوحًا.` : '',
      'بالتوفيق 🙏',
    ].filter(Boolean).join('\n');
  }
  return [
    `السلام عليكم ${r.name || ''}،`,
    `بخصوص طلبك للوصول إلى: ${scope} على منصة المخ.`,
    'يرجى إرسال إثبات الدفع (وصل CCP / BaridiMob) هنا لنفعّل حسابك. شكرًا 🙏',
  ].join('\n');
};

// حقول نطاق الرمز (مستوى + مادة + فصل/وحدة أو «المادة كاملة»)
function ScopeFields({ level, onLevel, module, onModule, scopeType, onScopeType, group, onGroup }) {
  const isBac = level === 'bac';
  const scopeOptions = [
    { value: 'module', label: 'المادة كاملة' },
    ...(isBac
      ? [{ value: 'unit', label: 'وحدة محددة' }]
      : [{ value: 'trimester', label: 'فصل محدد' }]),
  ];
  return (
    <>
      <div className="gen-row" style={{ alignItems: 'flex-end' }}>
        <div className="field" style={{ flex: 1 }}>
          <label>المستوى الدراسي</label>
          <select
            className="inp"
            value={level}
            onChange={(e) => {
              onLevel(e.target.value);
              onScopeType('module');
              onGroup('');
            }}
          >
            <option value="">اختر المستوى</option>
            {LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
          </select>
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>المادة (الرمز يفتحها فقط)</label>
          <select
            className="inp"
            value={module}
            onChange={(e) => onModule(e.target.value)}
          >
            <option value="">اختر المادة</option>
            {MODULES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>نطاق الرمز</label>
          <select
            className="inp"
            value={scopeType}
            onChange={(e) => {
              onScopeType(e.target.value);
              onGroup('');
            }}
          >
            {scopeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>

      {scopeType === 'trimester' && (
        <div className="field">
          <label>الفصل الدراسي</label>
          <select className="inp" value={group} onChange={(e) => onGroup(e.target.value)}>
            <option value="">اختر الفصل</option>
            {TRIMESTERS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
      )}
      {scopeType === 'unit' && (
        <div className="field">
          <label>اسم الوحدة (كما مكتوب في الدروس)</label>
          <input
            className="inp"
            value={group}
            onChange={(e) => onGroup(e.target.value)}
            placeholder="مثال: الوحدة الأولى"
          />
        </div>
      )}

      <p className="small" style={{ marginTop: 6 }}>
        رمز بدون فصل/وحدة يفتح المادة كلها (رياضيات أو فيزياء) لهذا المستوى.
      </p>
    </>
  );
}

export default function AdminAccess() {
  const [tab, setTab] = useState('requests'); // 'requests' | 'codes'
  const [requests, setRequests] = useState([]);
  const [codes, setCodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [approveTarget, setApproveTarget] = useState(null);
  const [approveCode, setApproveCode] = useState('');
  const [approveNote, setApproveNote] = useState('');
  const [busy, setBusy] = useState(false);

  // نطاق الرمز الجديد (المادة/الفصل/الوحدة)
  const [newLevel, setNewLevel] = useState('');
  const [newModule, setNewModule] = useState('');
  const [newScopeType, setNewScopeType] = useState('module'); // 'module' | 'trimester' | 'unit'
  const [newGroup, setNewGroup] = useState('');

  // نطاق الرمز عند اعتماد طلب وصول
  const [approveLevel, setApproveLevel] = useState('');
  const [approveModule, setApproveModule] = useState('');
  const [approveScopeType, setApproveScopeType] = useState('module');
  const [approveGroup, setApproveGroup] = useState('');

  // بناء وثيقة رمز بنطاقه: level + module إلزاميان، والمجموعة (فصل/وحدة) اختيارية.
  // maxUses: عدد الطلاب الذين يمكنهم استعمال الرمز (فارغ = بلا حدّ). الافتراضي 1 = رمز لطالب واحد.
  const buildCodePayload = ({ code, note, days, scopeType, level, module, group, maxUses }) => {
    // module === BUNDLE ⇒ عرض المادتين: نكتب modules: ['math','physics'].
    // نُبقي حقل module للتوافق مع الرموز القديمة وواجهات العرض، لكن المصدر
    // الذي تتحقق منه قواعد Firestore وتطبيق الطالب هو modules حين وُجد.
    const isBundle = module === BUNDLE;
    const payload = {
      code,
      active: true,
      note: (note || '').trim() || null,
      createdAt: serverTimestamp(),
      expiresAt: days > 0 ? new Date(Date.now() + days * 86400000) : null,
      level,
      module: isBundle ? 'math' : module,
      maxUses: maxUses === '' || maxUses == null ? null : Math.max(1, Number(maxUses) || 1),
      usedBy: [],
    };
    if (isBundle) payload.modules = ['math', 'physics'];
    if (scopeType === 'trimester') payload.trimester = group;
    if (scopeType === 'unit') payload.unit = String(group || '').trim();
    return payload;
  };

  const [newCode, setNewCode] = useState('');
  const [newNote, setNewNote] = useState('');
  const [newDays, setNewDays] = useState(30);
  const [newMaxUses, setNewMaxUses] = useState(1);
  const [approveMaxUses] = useState(1); // رمز الموافقة لطالب واحد
  const [fullMaxUses, setFullMaxUses] = useState(1);

  // ===== مولّد العرض + تسجيل البيع =====
  // شاشة واحدة: تولّد الرمز (مادة واحدة أو المادتين معًا) وتسجّل الدفع في نفس الخطوة،
  // فلا يضيع بيع لأن أحدهم نسي تدوينه بعد إرسال الرمز على واتساب.
  const [pricing, setPricing] = useState({});
  const [ofLevel, setOfLevel] = useState('');
  const [ofModule, setOfModule] = useState(BUNDLE);
  const [ofScope, setOfScope] = useState('module');
  const [ofGroup, setOfGroup] = useState('');
  const [ofDays, setOfDays] = useState(365);
  const [ofMaxUses, setOfMaxUses] = useState(1);
  const [ofName, setOfName] = useState('');
  const [ofPhone, setOfPhone] = useState('');
  const [ofMethod, setOfMethod] = useState('baridimob');
  const [ofAmount, setOfAmount] = useState('');
  const [ofNote, setOfNote] = useState('');
  const [ofCreated, setOfCreated] = useState(null);

  useEffect(() => { fetchPricing(db).then((p) => setPricing(p.prices)); }, []);

  // السعر من القائمة يملأ المبلغ تلقائيًا، ويبقى قابلًا للتعديل (تخفيض).
  // ofTouched يمنع الملء التلقائي من دهس مبلغ كتبه المشرف بيده — قائمة الأسعار
  // تصل من Firestore بعد أول رسم، فبدونها كان التخفيض المكتوب يُمحى فجأة.
  const [ofTouched, setOfTouched] = useState(false);
  const ofListPrice = ofLevel ? priceFor(pricing, ofLevel, ofModule, ofScope) : null;
  useEffect(() => {
    if (ofTouched) return;
    setOfAmount(ofListPrice == null ? '' : String(ofListPrice));
  }, [ofListPrice, ofTouched]);

  const ofModuleChoices = [...MODULES, { value: BUNDLE, label: 'رياضيات + فيزياء (العرض الكامل)' }];
  const ofScopeChoices = [
    { value: 'module', label: 'المادة كاملة' },
    ...(ofLevel === 'bac'
      ? [{ value: 'unit', label: 'وحدة محددة' }]
      : [{ value: 'trimester', label: 'فصل محدد' }]),
  ];

  const createOffer = async (e) => {
    e.preventDefault();
    setError('');
    if (!ofLevel) { setError('اختر المستوى الدراسي للعرض.'); return; }
    if (ofScope === 'trimester' && !ofGroup) { setError('اختر الفصل الدراسي.'); return; }
    if (ofScope === 'unit' && !String(ofGroup).trim()) { setError('اكتب اسم الوحدة.'); return; }
    const amount = Number(ofAmount);
    if (!Number.isFinite(amount) || amount < 0) { setError('أدخل مبلغًا صحيحًا.'); return; }

    const code = genCode();
    setBusy(true);
    try {
      await setDoc(doc(db, 'accessCodes', code), buildCodePayload({
        code,
        note: ofNote || `${moduleLabelOrBundle(ofModule)} — ${levelLabel(ofLevel)}${ofName ? ` · ${ofName}` : ''}`,
        days: ofDays,
        scopeType: ofScope,
        level: ofLevel,
        module: ofModule,
        group: ofGroup,
        maxUses: ofMaxUses,
      }));
      // البيع يُسجَّل بالرمز نفسه كمعرّف — إعادة الإرسال لا تُنشئ بيعًا مكرّرًا
      await recordSale(db, {
        code,
        amount,
        listPrice: ofListPrice,
        level: ofLevel,
        module: ofModule,
        scope: ofScope,
        group: ofGroup,
        student: { name: ofName, phone: ofPhone },
        method: ofMethod,
        note: ofNote,
        paidAt: new Date(),
      });
      setOfCreated({
        code, level: ofLevel, module: ofModule, scope: ofScope, group: ofGroup,
        amount, name: ofName, phone: ofPhone,
      });
      setOfName(''); setOfPhone(''); setOfNote(''); setOfTouched(false);
      loadAll();
    } catch (err) {
      console.error(err);
      setError('تعذّر إنشاء العرض — تحقّق من الصلاحيات.');
    } finally { setBusy(false); }
  };

  const offerWaText = (o) => [
    `السلام عليكم ${o?.name || ''}،`,
    `تم تفعيل اشتراكك في منصة المخ ✅`,
    `العرض: ${levelLabel(o?.level)} · ${moduleLabelOrBundle(o?.module)}`,
    `رمز الدخول: ${o?.code}`,
    o?.module === BUNDLE
      ? 'هذا الرمز يفتح الرياضيات والفيزياء معًا — أدخله مرة واحدة من «لدي رمز».'
      : 'أدخله من «لدي رمز» داخل المنصة.',
    'بالتوفيق 🙏',
  ].filter(Boolean).join('\n');

  // مولّد سريع لرمز «المادة كاملة» (كل الفصول/الوحدات) — مستوى + مادة فقط
  const [fullLevel, setFullLevel] = useState('');
  const [fullModule, setFullModule] = useState('');
  const [fullDays, setFullDays] = useState(365);
  const [fullNote, setFullNote] = useState('');
  const [fullCreated, setFullCreated] = useState(null); // آخر رمز مولَّد للعرض/النسخ

  const createFullModuleCode = async (e) => {
    e.preventDefault();
    setError('');
    if (!fullLevel || !fullModule) {
      setError('اختر المستوى والمادة لرمز المادة كاملة.');
      return;
    }
    const code = genCode();
    setBusy(true);
    try {
      await setDoc(doc(db, 'accessCodes', code), buildCodePayload({
        code,
        note: fullNote || `${moduleLabel(fullModule)} كاملة — ${levelLabel(fullLevel)}`,
        days: fullDays,
        scopeType: 'module',
        level: fullLevel,
        module: fullModule,
        group: '',
        maxUses: fullMaxUses,
      }));
      setFullCreated({ code, level: fullLevel, module: fullModule });
      setFullNote('');
      loadAll();
    } catch (err) { console.error(err); setError('تعذّر إنشاء الرمز.'); }
    finally { setBusy(false); }
  };

  const loadAll = async () => {
    setLoading(true); setError('');
    try {
      const [reqSnap, codeSnap] = await Promise.all([
        getDocs(query(collection(db, 'accessRequests'), orderBy('createdAt', 'desc'))),
        getDocs(collection(db, 'accessCodes')),
      ]);
      setRequests(reqSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setCodes(codeSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error('load access failed:', e);
      setError('تعذّر تحميل البيانات — تحقق من صلاحيات القراءة.');
    } finally { setLoading(false); }
  };

  useEffect(() => { loadAll(); }, []);

  const approve = async (e) => {
    e.preventDefault();
    if (!approveCode.trim()) return;
    if (!approveLevel || !approveModule) {
      setError('اختر المستوى والمادة — كل رمز خاص بمادة واحدة.');
      return;
    }
    if (approveScopeType === 'trimester' && !approveGroup) {
      setError('اختر الفصل الدراسي لهذا الرمز.');
      return;
    }
    if (approveScopeType === 'unit' && !String(approveGroup || '').trim()) {
      setError('اكتب اسم الوحدة لهذا الرمز.');
      return;
    }
    const code = approveCode.trim().toUpperCase();
    setBusy(true);
    try {
      await setDoc(doc(db, 'accessCodes', code), buildCodePayload({
        code,
        note: approveNote,
        days: 0,
        scopeType: approveScopeType,
        level: approveLevel,
        module: approveModule,
        group: approveGroup,
        maxUses: approveMaxUses,
      }));
      await updateDoc(doc(db, 'accessRequests', approveTarget.id), {
        status: 'approved', code, reviewedAt: serverTimestamp(),
      });
      // فتح القسم مباشرة في حساب الطالب (إن كان الطلب مرتبطًا بحساب) — الرمز يبقى احتياطًا
      if (approveTarget.uid) {
        const group = approveScopeType === 'module' ? '' : String(approveGroup || '').trim();
        const key = group ? `${approveLevel}_${approveModule}_${group}` : `${approveLevel}_${approveModule}`;
        try {
          await setDoc(doc(db, 'users', approveTarget.uid), { unlockedGroups: arrayUnion(key) }, { merge: true });
        } catch (e) {
          console.error('auto-unlock failed:', e);
        }
      }
      setApproveTarget(null); setApproveCode(''); setApproveNote('');
      loadAll();
    } catch (err) { console.error(err); setError('تعذّر اعتماد الطلب.'); }
    finally { setBusy(false); }
  };

  const reject = async (req) => {
    try {
      await updateDoc(doc(db, 'accessRequests', req.id), { status: 'rejected', reviewedAt: serverTimestamp() });
      loadAll();
    } catch (e) { console.error(e); }
  };

  const createCode = async (e) => {
    e.preventDefault();
    const code = (newCode || genCode()).toUpperCase();
    if (!newLevel || !newModule) {
      setError('اختر المستوى والمادة — كل رمز خاص بمادة واحدة.');
      return;
    }
    if (newScopeType === 'trimester' && !newGroup) {
      setError('اختر الفصل الدراسي لهذا الرمز.');
      return;
    }
    if (newScopeType === 'unit' && !String(newGroup || '').trim()) {
      setError('اكتب اسم الوحدة لهذا الرمز.');
      return;
    }
    setBusy(true);
    try {
      await setDoc(doc(db, 'accessCodes', code), buildCodePayload({
        code,
        note: newNote,
        days: newDays,
        scopeType: newScopeType,
        level: newLevel,
        module: newModule,
        group: newGroup,
        maxUses: newMaxUses,
      }));
      setNewCode(''); setNewNote('');
      loadAll();
    } catch (e) { console.error(e); setError('تعذّر إنشاء الرمز.'); }
    finally { setBusy(false); }
  };

  const toggleCode = async (c) => {
    try { await updateDoc(doc(db, 'accessCodes', c.id), { active: !c.active }); loadAll(); }
    catch (e) { console.error(e); }
  };

  const copy = (v) => { navigator.clipboard?.writeText(v || '').catch(() => {}); };

  return (
    <AdminLayout title="إدارة الوصول" subtitle="اعتماد طلبات المشاهدة وإدارة رموز الدخول">
      <style>{`
        :root{--ink-teal:#0E3B36;--ink-teal-deep:#092824;--parchment:#F6EEDC;--parchment-dim:#EFE3C8;--gold:#E3A23C;--text-dark:#1C1A15;--line:rgba(28,26,21,0.14);}
        *{margin:0;padding:0;box-sizing:border-box;}
        body{background:var(--parchment-dim);}
        .topbar{display:flex;align-items:center;justify-content:space-between;background:var(--ink-teal);color:var(--parchment);padding:18px 32px;flex-wrap:wrap;gap:10px;}
        .topbar-brand{display:flex;align-items:center;gap:10px;}
        .logo-mark{width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:var(--gold);color:var(--ink-teal-deep);font-family:'Aref Ruqaa',serif;font-size:17px;font-weight:700;}
        .topbar-brand span{font-family:'Aref Ruqaa',serif;font-size:19px;}
        .topbar-right{display:flex;align-items:center;gap:14px;flex-wrap:wrap;justify-content:flex-end;}
        .nav-link{color:rgba(246,238,220,0.75);font-size:13.5px;font-weight:600;cursor:pointer;padding:8px 14px;border-radius:8px;transition:all .2s;background:none;border:0;font-family:inherit;}
        .nav-link:hover,.nav-link.active{color:var(--parchment);background:rgba(246,238,220,0.1);}
        .logout-btn{border:1.5px solid rgba(246,238,220,0.35);background:transparent;color:var(--parchment);padding:9px 18px;border-radius:999px;cursor:pointer;font-family:inherit;font-weight:600;font-size:13.5px;}
        .body{padding:28px;max-width:1000px;margin:0 auto;}
        .tabs{display:flex;gap:10px;margin-bottom:22px;}
        .tab{padding:11px 22px;border:1.5px solid var(--line);border-radius:12px;background:#fffdf6;cursor:pointer;font-family:inherit;font-weight:700;font-size:13.5px;color:var(--text-dark);}
        .tab.active{background:var(--ink-teal);border-color:var(--ink-teal);color:var(--parchment);}
        .panel{background:#fffdf6;border:1px solid var(--line);border-radius:16px;padding:22px;margin-bottom:20px;}
        .row-item{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:13px 0;border-bottom:1px solid var(--line);flex-wrap:wrap;}
        .row-item:last-child{border-bottom:none;}
        .who b{color:var(--text-dark);font-size:14px;display:block;}
        .who span{font-size:12px;color:#5c584c;}
        .st{border-radius:999px;padding:4px 12px;font-size:11.5px;font-weight:700;}
        .st-pending{background:rgba(227,162,60,.18);color:#7a5612;border:1px solid rgba(227,162,60,.5);}
        .st-approved{background:rgba(46,139,87,.14);color:#1f6b41;border:1px solid rgba(46,139,87,.4);}
        .st-rejected{background:rgba(178,58,46,.1);color:#8c2a20;border:1px solid rgba(178,58,46,.3);}
        .acts{display:flex;gap:8px;flex-wrap:wrap;}
        .btn{border:0;border-radius:10px;padding:9px 16px;cursor:pointer;font-family:inherit;font-weight:700;font-size:12.5px;}
        .btn-ok{background:var(--ink-teal);color:var(--parchment);}
        .btn-no{background:transparent;border:1.5px solid rgba(178,58,46,.4);color:#8c2a20;}
        .btn-ghost{background:var(--parchment-dim);color:var(--text-dark);}
        .btn-wa{background:#25D366;color:#fff;text-decoration:none;display:inline-flex;align-items:center;gap:4px;}
        .btn-wa:hover{background:#1ebe5a;}
        .acct-chip{font-size:10.5px;font-weight:700;color:#1f6b41;background:rgba(46,139,87,.12);border-radius:999px;padding:2px 8px;margin-inline-start:6px;vertical-align:middle;}
        .code-chip{font-family:monospace;font-weight:700;color:var(--ink-teal);letter-spacing:2px;direction:ltr;font-size:15px;}
        .field{margin-bottom:12px;}
        .field label{display:block;font-size:12.5px;font-weight:600;margin-bottom:6px;color:var(--text-dark);}
        .inp{width:100%;border:1.5px solid var(--line);border-radius:10px;padding:10px 12px;font-family:inherit;font-size:13.5px;background:#fffdf6;outline:0;}
        .inp:focus{border-color:var(--gold);}
        .msg-red{background:rgba(178,58,46,.08);border:1px solid rgba(178,58,46,.3);color:#8c2a20;border-radius:10px;padding:10px 12px;font-size:12.5px;margin-bottom:14px;}
        .empty{color:#9a918a;text-align:center;padding:24px 0;font-size:13.5px;}
        .modal-back{position:fixed;inset:0;background:rgba(9,40,36,.6);display:flex;align-items:center;justify-content:center;z-index:60;padding:16px;}
        .modal{background:var(--parchment);border-radius:16px;max-width:430px;width:100%;padding:24px;}
        .modal h3{font-family:'Aref Ruqaa',serif;color:var(--ink-teal);margin-bottom:16px;font-size:19px;}
        .gen-row{display:flex;gap:10px;align-items:center;}
        .btn-gen{background:var(--gold);color:var(--ink-teal-deep);}
        .small{font-size:12px;color:#5c584c;}
        .full-panel{margin-bottom:18px;border:1.5px dashed rgba(227,162,60,.7);background:linear-gradient(135deg,rgba(227,162,60,.14),rgba(14,59,54,.05));border-radius:14px;padding:16px;}
        .full-head{display:flex;align-items:flex-start;gap:12px;margin-bottom:12px;}
        .full-ico{font-size:28px;line-height:1;}
        .full-head h3{font-family:'Aref Ruqaa',serif;font-size:18px;color:var(--ink-teal);margin:0 0 4px;}
        .full-head p{margin:0;line-height:1.7;}
        .full-result{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-top:8px;background:#fffdf6;border:1px solid var(--line);border-radius:10px;padding:10px 14px;font-size:13px;}
        .code-chip.big{font-size:20px;letter-spacing:4px;}
        .full-badge{display:inline-block;font-size:10.5px;font-weight:700;color:#7a5612;background:rgba(227,162,60,.2);border-radius:999px;padding:2px 9px;margin-inline-start:6px;vertical-align:middle;}
        @media(max-width:600px){.body{padding:20px;} .topbar{padding:14px 16px;}}
      `}</style>
<main className="body">
        <h1 style={{ fontFamily: "'Aref Ruqaa', serif", fontSize: 26, color: '#0E3B36', marginBottom: 20 }}>إدارة الوصول إلى الدروس</h1>

        {error && <div className="msg-red">{error}</div>}
        {loading && <div className="empty">...جارٍ التحميل</div>}

        <div className="tabs">
          <button className={'tab ' + (tab === 'requests' ? 'active' : '')} onClick={() => setTab('requests')}>طلبات الوصول ({requests.filter((r) => r.status === 'pending').length})</button>
          <button className={'tab ' + (tab === 'offer' ? 'active' : '')} onClick={() => setTab('offer')}>💰 بيع عرض</button>
          <button className={'tab ' + (tab === 'codes' ? 'active' : '')} onClick={() => setTab('codes')}>رموز الدخول ({codes.length})</button>
        </div>

        {tab === 'requests' && !loading && (
          <div className="panel">
            {requests.length === 0 ? (
              <div className="empty">لا توجد طلبات بعد.</div>
            ) : (
              requests.map((r) => {
                const st = STATUS[r.status] || { label: r.status, cls: 'st-pending' };
                return (
                  <div className="row-item" key={r.id}>
                    <div className="who">
                      <b>{r.name}{r.uid ? ' ' : ' '}{r.uid && <span className="acct-chip" title={r.uid}>حساب ✓</span>}</b>
                      <span dir="ltr">{r.email}</span>
                      {r.phone && <> · <span dir="ltr">{r.phone}</span></>}
                      {' '}— <span>{fmtDate(r.createdAt)}</span>
                      <span className="small" style={{ display: 'block' }}>
                        {requestScopeLabel(r)}
                        {isModuleRequest(r) && <span className="full-badge">مادة كاملة</span>}
                      </span>
                      {r.code && <div className="small">الرمز: <span className="code-chip">{r.code}</span></div>}
                    </div>
                    <div style={{ textAlign: 'left' }}>
                      <span className={'st ' + st.cls}>{st.label}</span>
                    </div>
                    <div className="acts">
                      {r.phone && (
                        <a className="btn btn-wa" href={waLink(r.phone, waMessage(r))} target="_blank" rel="noopener noreferrer">
                          💬 واتساب
                        </a>
                      )}
                      {r.status === 'pending' && (
                        <>
                          <button
                            className="btn btn-ok"
                            onClick={() => {
                              setApproveTarget(r);
                              setApproveCode('');
                              setApproveNote('');
                              setApproveLevel(r.level || '');
                              setApproveModule(r.module || '');
                              setApproveScopeType(
                                r.level === 'bac'
                                  ? (r.unit ? 'unit' : 'module')
                                  : (r.trimester ? 'trimester' : 'module')
                              );
                              setApproveGroup(r.level === 'bac' ? (r.unit || '') : (r.trimester || ''));
                            }}
                          >
                            موافقة
                          </button>
                          <button className="btn btn-no" onClick={() => reject(r)}>رفض</button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
{tab === 'offer' && !loading && (
          <div className="panel">
            <div className="full-head">
              <span className="full-ico">💰</span>
              <div>
                <h3>بيع عرض وتوليد رمزه</h3>
                <p className="small">
                  خطوة واحدة: يولّد الرمز ويسجّل الدفع في سجلّ الإيرادات معًا.
                  «العرض الكامل» يُنشئ رمزًا واحدًا يفتح الرياضيات والفيزياء بإدخال واحد.
                </p>
              </div>
            </div>

            <form onSubmit={createOffer}>
              <div className="gen-row" style={{ alignItems: 'flex-end' }}>
                <div className="field" style={{ flex: 1 }}>
                  <label>المستوى الدراسي</label>
                  <select
                    className="inp"
                    value={ofLevel}
                    onChange={(e) => { setOfLevel(e.target.value); setOfScope('module'); setOfGroup(''); setOfTouched(false); }}
                  >
                    <option value="">اختر المستوى</option>
                    {LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                  </select>
                </div>
                <div className="field" style={{ flex: 1 }}>
                  <label>العرض</label>
                  <select className="inp" value={ofModule} onChange={(e) => { setOfModule(e.target.value); setOfTouched(false); }}>
                    {ofModuleChoices.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>
                <div className="field" style={{ flex: 1 }}>
                  <label>النطاق</label>
                  <select
                    className="inp"
                    value={ofScope}
                    onChange={(e) => { setOfScope(e.target.value); setOfGroup(''); setOfTouched(false); }}
                  >
                    {ofScopeChoices.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>

              {ofScope === 'trimester' && (
                <div className="field">
                  <label>الفصل الدراسي</label>
                  <select className="inp" value={ofGroup} onChange={(e) => setOfGroup(e.target.value)}>
                    <option value="">اختر الفصل</option>
                    {TRIMESTERS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
              )}
              {ofScope === 'unit' && (
                <div className="field">
                  <label>اسم الوحدة (كما هو مكتوب في الدروس)</label>
                  <input className="inp" value={ofGroup} onChange={(e) => setOfGroup(e.target.value)} placeholder="مثال: الوحدة الأولى" />
                </div>
              )}

              <div className="gen-row" style={{ alignItems: 'flex-end' }}>
                <div className="field" style={{ flex: 1 }}>
                  <label>اسم الطالب</label>
                  <input className="inp" value={ofName} onChange={(e) => setOfName(e.target.value)} placeholder="الاسم الكامل" />
                </div>
                <div className="field" style={{ flex: 1 }}>
                  <label>رقم الهاتف (واتساب)</label>
                  <input className="inp" dir="ltr" value={ofPhone} onChange={(e) => setOfPhone(e.target.value)} placeholder="0550..." />
                </div>
              </div>

              <div className="gen-row" style={{ alignItems: 'flex-end' }}>
                <div className="field" style={{ flex: 1 }}>
                  <label>
                    المبلغ المقبوض (دج)
                    {ofListPrice != null && <span className="full-badge">سعر القائمة {fmtMoney(ofListPrice)}</span>}
                  </label>
                  <input
                    className="inp"
                    dir="ltr"
                    type="number"
                    min="0"
                    step="100"
                    value={ofAmount}
                    onChange={(e) => { setOfAmount(e.target.value); setOfTouched(true); }}
                    placeholder={ofListPrice == null ? 'لا سعر في القائمة — أدخله' : ''}
                  />
                </div>
                <div className="field" style={{ flex: 1 }}>
                  <label>طريقة الدفع</label>
                  <select className="inp" value={ofMethod} onChange={(e) => setOfMethod(e.target.value)}>
                    {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>
                <div className="field" style={{ width: 120 }}>
                  <label>صلاحية (يوم)</label>
                  <input className="inp" dir="ltr" type="number" min="0" value={ofDays} onChange={(e) => setOfDays(Number(e.target.value))} />
                </div>
                <div className="field" style={{ width: 120 }}>
                  <label>عدد الطلاب</label>
                  <input className="inp" dir="ltr" type="number" min="1" value={ofMaxUses} onChange={(e) => setOfMaxUses(Number(e.target.value))} />
                </div>
              </div>

              <div className="field">
                <label>ملاحظة (اختياري)</label>
                <input className="inp" value={ofNote} onChange={(e) => setOfNote(e.target.value)} placeholder="مثال: تخفيض أخوين" />
              </div>

              {ofListPrice != null && Number(ofAmount) < ofListPrice && Number(ofAmount) >= 0 && (
                <p className="small" style={{ color: '#8c2a20', marginBottom: 10 }}>
                  تخفيض {fmtMoney(ofListPrice - Number(ofAmount))} عن سعر القائمة — سيُسجَّل الفرق في التقرير.
                </p>
              )}

              <button className="btn btn-gen" type="submit" disabled={busy}>
                {busy ? '...جارٍ الإنشاء' : 'أنشئ الرمز وسجّل البيع'}
              </button>
            </form>

            {ofCreated && (
              <div className="full-result" style={{ marginTop: 16 }}>
                <span className="code-chip big">{ofCreated.code}</span>
                <span>
                  {levelLabel(ofCreated.level)} · {moduleLabelOrBundle(ofCreated.module)}
                  {ofCreated.module === BUNDLE && <span className="full-badge">يفتح المادتين</span>}
                  <br />
                  <span className="small">سُجِّل بيع بـ {fmtMoney(ofCreated.amount)}</span>
                </span>
                <button type="button" className="btn btn-ghost" onClick={() => copy(ofCreated.code)}>نسخ الرمز</button>
                {ofCreated.phone && (
                  <a className="btn btn-wa" href={waLink(ofCreated.phone, offerWaText(ofCreated))} target="_blank" rel="noreferrer">
                    إرسال بواتساب
                  </a>
                )}
              </div>
            )}
          </div>
        )}

        {tab === 'codes' && !loading && (
          <div className="panel">
            <form onSubmit={createFullModuleCode} className="full-panel">
              <div className="full-head">
                <span className="full-ico">🎁</span>
                <div>
                  <h3>رمز المادة كاملة</h3>
                  <p className="small">رمز واحد يفتح <b>كل الفصول</b> (أو كل الوحدات للبكالوريا) لمادة واحدة في مستوى واحد — للطلاب الذين يشترون المادة كلها.</p>
                </div>
              </div>
              <div className="gen-row" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div className="field" style={{ flex: 1, minWidth: 160 }}>
                  <label>المستوى</label>
                  <select className="inp" value={fullLevel} onChange={(e) => setFullLevel(e.target.value)}>
                    <option value="">اختر المستوى</option>
                    {LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                  </select>
                </div>
                <div className="field" style={{ flex: 1, minWidth: 140 }}>
                  <label>المادة</label>
                  <select className="inp" value={fullModule} onChange={(e) => setFullModule(e.target.value)}>
                    <option value="">اختر المادة</option>
                    {MODULES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>
                <div className="field" style={{ width: 120 }}>
                  <label>الصلاحية (أيام)</label>
                  <input className="inp" type="number" min="0" value={fullDays} onChange={(e) => setFullDays(Number(e.target.value))} />
                </div>
                <div className="field" style={{ width: 130 }}>
                  <label title="فارغ = بلا حدّ">عدد الطلاب</label>
                  <input className="inp" type="number" min="1" placeholder="بلا حدّ" value={fullMaxUses} onChange={(e) => setFullMaxUses(e.target.value)} />
                </div>
                <div className="field" style={{ flex: 1, minWidth: 160 }}>
                  <label>ملاحظة (اختياري)</label>
                  <input className="inp" value={fullNote} onChange={(e) => setFullNote(e.target.value)} placeholder="مثال: الطالب أحمد — دفع سنوي" />
                </div>
                <div className="field">
                  <button className="btn btn-gen" type="submit" disabled={busy}>{busy ? '...' : '🎁 توليد رمز المادة كاملة'}</button>
                </div>
              </div>
              {fullCreated && (
                <div className="full-result">
                  <span>الرمز الجديد لـ <b>{moduleLabel(fullCreated.module)} كاملة · {levelLabel(fullCreated.level)}</b>:</span>
                  <span className="code-chip big">{fullCreated.code}</span>
                  <button type="button" className="btn btn-ghost" onClick={() => copy(fullCreated.code)}>نسخ</button>
                </div>
              )}
            </form>

            <form onSubmit={createCode} style={{ marginBottom: 18, background: '#EFE3C8', borderRadius: 12, padding: 16 }}>
              <p className="small" style={{ marginBottom: 10, fontWeight: 700, color: 'var(--ink-teal)' }}>رمز مخصص (فصل / وحدة / مادة كاملة)</p>
              <div className="field">
                <label>رمز مخصص (اختياري — اتركه فارغًا لتوليد تلقائي)</label>
                <div className="gen-row">
                  <input className="inp" dir="ltr" value={newCode} onChange={(e) => setNewCode(e.target.value.toUpperCase())} placeholder="ABC123" style={{ fontFamily: 'monospace', letterSpacing: '2px' }} />
                  <button type="button" className="btn btn-gen" onClick={() => setNewCode(genCode())}>توليد</button>
                </div>
              </div>
<ScopeFields
                level={newLevel}
                onLevel={setNewLevel}
                module={newModule}
                onModule={setNewModule}
                scopeType={newScopeType}
                onScopeType={setNewScopeType}
                group={newGroup}
                onGroup={setNewGroup}
              />
              <div className="gen-row" style={{ alignItems: 'flex-end' }}>
                <div className="field" style={{ flex: 1 }}>
                  <label>ملاحظة (اختياري)</label>
                  <input className="inp" value={newNote} onChange={(e) => setNewNote(e.target.value)} placeholder="مثال: قسم 4AM" />
                </div>
                <div className="field" style={{ width: 140 }}>
                  <label>الصلاحية (أيام)</label>
                  <input className="inp" type="number" min="0" value={newDays} onChange={(e) => setNewDays(Number(e.target.value))} />
                </div>
                <div className="field" style={{ width: 140 }}>
                  <label title="فارغ = بلا حدّ">عدد الطلاب</label>
                  <input className="inp" type="number" min="1" placeholder="بلا حدّ" value={newMaxUses} onChange={(e) => setNewMaxUses(e.target.value)} />
                </div>
              </div>
              <button className="btn btn-ok" type="submit" disabled={busy} style={{ marginTop: 4 }}>{busy ? 'جارٍ الإنشاء...' : 'إنشاء رمز جديد'}</button>
              <p className="small" style={{ marginTop: 8 }}>اكتب 0 لرمز بدون انتهاء صلاحية. «عدد الطلاب» = كم حسابًا يستطيع استعمال الرمز (1 يمنع تداوله؛ فارغ = بلا حدّ).</p>
            </form>

            {codes.length === 0 ? (
              <div className="empty">لا توجد رموز بعد.</div>
            ) : (
              codes.map((c) => {
                const exp = c.expiresAt ? fmtDate(c.expiresAt) : 'بدون انتهاء';
                return (
                  <div className="row-item" key={c.id}>
                    <div className="who">
                      <span className="code-chip">{c.code}</span>
                      {!c.trimester && !c.unit && <span className="full-badge">🎁 مادة كاملة</span>}
                      <span className="small" style={{ display: 'block' }}>
                        {scopeLabel(c)}{c.note ? ` — ${c.note}` : ''}
                      </span>
                      <span>انتهاء: {exp}</span>
                      <span className="small" style={{ display: 'block' }}>
                        الاستعمال: {(c.usedBy || []).length}{c.maxUses != null ? ` / ${c.maxUses}` : ' (بلا حدّ)'}
                        {c.maxUses != null && (c.usedBy || []).length >= c.maxUses ? ' — مستهلك' : ''}
                      </span>
                    </div>
                    <div style={{ textAlign: 'left' }}>
                      <span className={'st ' + (c.active ? 'st-approved' : 'st-rejected')}>{c.active ? 'مفعّل' : 'معطّل'}</span>
                    </div>
                    <div className="acts">
                      <button className="btn btn-ghost" onClick={() => copy(c.code)}>نسخ</button>
                      <button className={'btn ' + (c.active ? 'btn-no' : 'btn-ok')} onClick={() => toggleCode(c)}>{c.active ? 'تعطيل' : 'تفعيل'}</button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </main>

      {approveTarget && (
        <div className="modal-back" onClick={() => setApproveTarget(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>اعتماد طلب الوصول</h3>
            <p className="small" style={{ marginBottom: 12 }}>
              الموافقة على <b>{approveTarget.name}</b> ({approveTarget.email}).
              {approveTarget.uid
                ? ' سيُفتح القسم في حسابه مباشرة، والرمز يبقى احتياطًا.'
                : ' الطلب غير مرتبط بحساب — أرسل له الرمز عبر واتساب.'}
            </p>
            <form onSubmit={approve}>
              <div className="field">
                <label>رمز الدخول</label>
                <div className="gen-row">
                  <input className="inp" dir="ltr" value={approveCode} onChange={(e) => setApproveCode(e.target.value.toUpperCase())} placeholder="ABC123" style={{ fontFamily: 'monospace', letterSpacing: '2px', textTransform: 'uppercase' }} required />
                  <button type="button" className="btn btn-gen" onClick={() => setApproveCode(genCode())}>توليد</button>
                </div>
              </div>
              <ScopeFields
                level={approveLevel}
                onLevel={setApproveLevel}
                module={approveModule}
                onModule={setApproveModule}
                scopeType={approveScopeType}
                onScopeType={setApproveScopeType}
                group={approveGroup}
                onGroup={setApproveGroup}
              />
              <div className="field">
                <label>ملاحظة (اختياري)</label>
                <input className="inp" value={approveNote} onChange={(e) => setApproveNote(e.target.value)} />
              </div>
              <button className="btn btn-ok" type="submit" disabled={busy} style={{ width: '100%' }}>{busy ? 'جارٍ الحفظ...' : 'اعتماد ومنح رمز'}</button>
            </form>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}

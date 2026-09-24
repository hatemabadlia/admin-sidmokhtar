// src/pages/AdminRevenue.jsx — الإيرادات: الأرقام + سجلّ المبيعات + قائمة الأسعار
import React, { useEffect, useMemo, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';
import AdminLayout from '../components/AdminLayout';
import { levelLabel, fmtDate, waLink } from '../lib/access';
import {
  allOffers,
  fetchPricing,
  savePricing,
  fmtMoney,
  moduleLabelOrBundle,
  LANDING_PRICES,
  SCOPES,
} from '../lib/pricing';
import {
  fetchSales,
  recordSale,
  deleteSale,
  markRedeemed,
  codesWithoutSale,
  PAYMENT_METHODS,
  summarize,
  monthlySeries,
  groupRevenue,
  methodLabel,
} from '../lib/sales';
import { priceFor } from '../lib/pricing';

const scopeLabel = (v) => SCOPES.find((s) => s.value === v)?.label || v || '—';

export default function AdminRevenue() {
  const [tab, setTab] = useState('overview'); // overview | sales | prices
  const [sales, setSales] = useState([]);
  const [prices, setPrices] = useState({});
  const [draftPrices, setDraftPrices] = useState({});
  const [savedPrices, setSavedPrices] = useState({});
  const [codes, setCodes] = useState([]);
  const [recordFor, setRecordFor] = useState(null); // الرمز الذي نسجّل بيعه الآن
  const [rAmount, setRAmount] = useState('');
  const [rName, setRName] = useState('');
  const [rPhone, setRPhone] = useState('');
  const [rMethod, setRMethod] = useState('baridimob');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const loadAll = async () => {
    setLoading(true);
    setError('');
    try {
      const [rawSales, codeSnap, pricing] = await Promise.all([
        fetchSales(db),
        getDocs(collection(db, 'accessCodes')),
        fetchPricing(db),
      ]);
      const codeList = codeSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setCodes(codeList);
      setSales(markRedeemed(rawSales, codeList));
      setPrices(pricing.prices);
      setDraftPrices(pricing.prices);
      setSavedPrices(pricing.saved);
    } catch (e) {
      console.error('load revenue failed:', e);
      // نعرض رمز الخطأ نفسه — «تحقق من الصلاحيات» وحدها لا تكفي لتشخيص المشكلة
      setError(
        e?.code === 'permission-denied'
          ? 'القواعد ترفض قراءة المبيعات — تأكد أن حسابك role == "admin" في users/{uid}.'
          : `تعذّر تحميل بيانات الإيرادات (${e?.code || e?.message || 'خطأ غير معروف'}).`
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, []);

  const stats = useMemo(() => summarize(sales), [sales]);
  const months = useMemo(() => monthlySeries(sales, 6), [sales]);
  const byLevel = useMemo(() => groupRevenue(sales, 'level'), [sales]);
  const byModule = useMemo(() => groupRevenue(sales, 'module'), [sales]);
  const maxMonth = Math.max(1, ...months.map((m) => m.total));
  const offers = useMemo(() => allOffers(), []);

  const unpaidFollowUp = useMemo(
    () => sales.filter((s) => !s.redeemed).slice(0, 8),
    [sales]
  );

  const savePrices = async () => {
    setBusy(true);
    setError('');
    setMsg('');
    try {
      // نحفظ الأسعار الموجبة فقط — الحقل الفارغ يعني «غير مُسعَّر» لا صفرًا
      const clean = {};
      for (const [k, v] of Object.entries(draftPrices)) {
        const n = Number(v);
        if (Number.isFinite(n) && n > 0) clean[k] = n;
      }
      await savePricing(db, clean);
      setPrices(clean);
      setDraftPrices(clean);
      setSavedPrices(clean);
      setMsg('تم حفظ قائمة الأسعار.');
    } catch (e) {
      console.error(e);
      setError('تعذّر حفظ الأسعار.');
    } finally {
      setBusy(false);
    }
  };

  const removeSale = async (s) => {
    if (!window.confirm(`حذف بيع «${s.code || s.id}» بمبلغ ${fmtMoney(s.amount)}؟ لا يمكن التراجع.`)) return;
    setBusy(true);
    try {
      await deleteSale(db, s.id);
      loadAll();
    } catch (e) {
      console.error(e);
      setError('تعذّر حذف البيع.');
    } finally {
      setBusy(false);
    }
  };

  const missing = useMemo(() => codesWithoutSale(codes, sales), [codes, sales]);

  const openRecord = (c) => {
    const suggested = priceFor(prices, c.offer.level, c.offer.module, c.offer.scope);
    setRecordFor(c);
    setRAmount(suggested == null ? '' : String(suggested));
    setRName('');
    setRPhone('');
    setRMethod('baridimob');
  };

  const saveRecord = async () => {
    if (!recordFor) return;
    const amount = Number(rAmount);
    if (!Number.isFinite(amount) || amount <= 0) { setError('أدخل مبلغًا صحيحًا.'); return; }
    setBusy(true);
    setError('');
    try {
      await recordSale(db, {
        code: recordFor.id,
        amount,
        listPrice: priceFor(prices, recordFor.offer.level, recordFor.offer.module, recordFor.offer.scope),
        ...recordFor.offer,
        student: { name: rName, phone: rPhone },
        method: rMethod,
        note: recordFor.note || '',
        // الرمز أُنشئ سابقًا — ننسب الدفع إلى تاريخ إنشائه لا إلى اليوم،
        // وإلا ظهرت مبيعات قديمة كلها في شهر التسجيل وشوّهت التقرير.
        paidAt: recordFor.createdAt?.toDate?.() || new Date(),
      });
      setRecordFor(null);
      setMsg('تم تسجيل البيع.');
      loadAll();
    } catch (e) {
      console.error(e);
      setError('تعذّر تسجيل البيع.');
    } finally { setBusy(false); }
  };

  const priceDirty = JSON.stringify(prices) !== JSON.stringify(draftPrices);

  return (
    <AdminLayout title="الإيرادات" subtitle="المبيعات، الأرباح، وقائمة الأسعار">
      <style>{`
        .rv-cards{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:24px;}
        .rv-card{background:#fffdf6;border:1px solid var(--line);border-radius:16px;padding:18px 20px;}
        .rv-card.hero{background:linear-gradient(135deg,#0E3B36,#14534C);color:#F6EEDC;border-color:transparent;}
        .rv-k{font-size:11.5px;letter-spacing:.06em;color:var(--muted);margin-bottom:8px;display:block;}
        .rv-card.hero .rv-k{color:rgba(246,238,220,.7);}
        .rv-v{font-family:'Aref Ruqaa',serif;font-size:26px;font-weight:700;color:var(--ink-teal);line-height:1.2;}
        .rv-card.hero .rv-v{color:#F0B85C;font-size:30px;}
        .rv-sub{font-size:12px;color:var(--muted);margin-top:6px;}
        .rv-card.hero .rv-sub{color:rgba(246,238,220,.65);}

        .rv-panel{background:#fffdf6;border:1px solid var(--line);border-radius:16px;padding:22px;margin-bottom:20px;}
        .rv-panel h3{font-family:'Aref Ruqaa',serif;font-size:18px;color:var(--ink-teal);margin-bottom:4px;}
        .rv-panel .hint{font-size:12.5px;color:var(--muted);margin-bottom:16px;}

        .bars{display:flex;align-items:flex-end;gap:14px;height:170px;padding-top:8px;}
        .bar-col{flex:1;display:flex;flex-direction:column;align-items:center;gap:8px;height:100%;justify-content:flex-end;}
        .bar-amt{font-size:11px;font-family:monospace;color:var(--ink-teal);font-weight:700;}
        .bar{width:100%;border-radius:8px 8px 0 0;background:linear-gradient(180deg,#E3A23C,#c98a2c);min-height:4px;transition:height .3s;}
        .bar-lbl{font-size:11.5px;color:var(--muted);}

        .split{display:grid;grid-template-columns:1fr 1fr;gap:20px;}
        .mini-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 0;border-bottom:1px solid var(--line);font-size:13px;}
        .mini-row:last-child{border-bottom:0;}
        .mini-bar{height:6px;border-radius:999px;background:var(--parchment-dim);flex:1;margin:0 10px;overflow:hidden;}
        .mini-bar i{display:block;height:100%;background:var(--gold);border-radius:999px;}
        .mini-amt{font-family:monospace;font-weight:700;color:var(--ink-teal);white-space:nowrap;}

        .tbl{width:100%;border-collapse:collapse;font-size:13px;}
        .tbl th{text-align:right;font-size:11.5px;color:var(--muted);font-weight:600;padding:10px 8px;border-bottom:1.5px solid var(--line);white-space:nowrap;}
        .tbl td{padding:12px 8px;border-bottom:1px solid var(--line);vertical-align:middle;}
        .tbl tr:last-child td{border-bottom:0;}
        .code-chip{font-family:monospace;font-weight:700;color:var(--ink-teal);letter-spacing:2px;direction:ltr;}
        .amt{font-family:monospace;font-weight:700;color:#1f6b41;white-space:nowrap;}
        .amt.cut{color:#8c2a20;}
        .pill{border-radius:999px;padding:3px 10px;font-size:11px;font-weight:700;white-space:nowrap;}
        .pill-ok{background:rgba(46,139,87,.14);color:#1f6b41;border:1px solid rgba(46,139,87,.4);}
        .pill-wait{background:rgba(227,162,60,.18);color:#7a5612;border:1px solid rgba(227,162,60,.5);}
        .pill-dead{background:rgba(178,58,46,.1);color:#8c2a20;border:1px solid rgba(178,58,46,.3);}

        .tabs{display:flex;gap:10px;margin-bottom:22px;flex-wrap:wrap;}
        .tab{padding:11px 22px;border:1.5px solid var(--line);border-radius:12px;background:#fffdf6;cursor:pointer;font-family:inherit;font-weight:700;font-size:13.5px;color:var(--text-dark);}
        .tab.active{background:var(--ink-teal);border-color:var(--ink-teal);color:var(--parchment);}

        .price-grid{display:grid;grid-template-columns:1fr auto;gap:10px 16px;align-items:center;}
        .price-lbl{font-size:13px;color:var(--text-dark);}
        .price-inp{width:140px;border:1.5px solid var(--line);border-radius:10px;padding:9px 12px;font-family:monospace;font-size:14px;background:#fffdf6;outline:0;text-align:left;direction:ltr;}
        .price-inp:focus{border-color:var(--gold);}
        .price-group{font-family:'Aref Ruqaa',serif;font-size:15px;color:var(--ink-teal);margin:18px 0 8px;padding-bottom:6px;border-bottom:1.5px solid var(--line);}
        .price-group:first-child{margin-top:0;}
        .src-tag{font-size:10px;font-weight:700;border-radius:999px;padding:2px 8px;margin-inline-start:8px;vertical-align:middle;background:rgba(46,139,87,.12);color:#1f6b41;border:1px solid rgba(46,139,87,.3);}
        .src-tag.src-edit{background:rgba(227,162,60,.2);color:#7a5612;border-color:rgba(227,162,60,.5);}
        .src-tag.src-none{background:rgba(28,26,21,.06);color:#8a8574;border-color:var(--line);}

        .btn{border:0;border-radius:10px;padding:10px 18px;cursor:pointer;font-family:inherit;font-weight:700;font-size:13px;}
        .btn-gold{background:var(--gold);color:var(--ink-teal-deep);}
        .btn-ghost{background:var(--parchment-dim);color:var(--text-dark);}
        .btn-no{background:transparent;border:1.5px solid rgba(178,58,46,.4);color:#8c2a20;}
        .btn-wa{background:#25D366;color:#fff;text-decoration:none;display:inline-flex;align-items:center;gap:4px;padding:7px 12px;border-radius:9px;font-size:12px;font-weight:700;}
        .btn:disabled{opacity:.5;cursor:default;}
        .msg-red{background:rgba(178,58,46,.08);border:1px solid rgba(178,58,46,.3);color:#8c2a20;border-radius:10px;padding:10px 12px;font-size:12.5px;margin-bottom:14px;}
        .msg-ok{background:rgba(46,139,87,.1);border:1px solid rgba(46,139,87,.35);color:#1f6b41;border-radius:10px;padding:10px 12px;font-size:12.5px;margin-bottom:14px;}
        .empty{color:#9a918a;text-align:center;padding:26px 0;font-size:13.5px;}
        .scroll-x{overflow-x:auto;}
        .rv-modal-back{position:fixed;inset:0;background:rgba(9,40,36,.6);display:flex;align-items:center;justify-content:center;z-index:80;padding:16px;}
        .rv-modal{background:#fffdf6;border-radius:16px;max-width:420px;width:100%;padding:24px;max-height:90svh;overflow:auto;}
        .rv-modal h3{font-family:'Aref Ruqaa',serif;color:var(--ink-teal);font-size:18px;margin-bottom:6px;}
        .fld{margin-bottom:12px;}
        .fld label{display:block;font-size:12.5px;font-weight:600;margin-bottom:6px;color:var(--text-dark);}
        .inp{width:100%;border:1.5px solid var(--line);border-radius:10px;padding:10px 12px;font-family:inherit;font-size:13.5px;background:#fffdf6;outline:0;}
        .inp:focus{border-color:var(--gold);}
        .save-bar{display:flex;align-items:center;gap:12px;margin-top:20px;padding-top:16px;border-top:1px solid var(--line);}

        @media(max-width:980px){.rv-cards{grid-template-columns:1fr 1fr;}.split{grid-template-columns:1fr;}}
        @media(max-width:560px){.rv-cards{grid-template-columns:1fr;}}
      `}</style>

      {error && <div className="msg-red">{error}</div>}
      {msg && <div className="msg-ok">{msg}</div>}

      <div className="tabs">
        <button className={'tab' + (tab === 'overview' ? ' active' : '')} onClick={() => setTab('overview')}>
          نظرة عامة
        </button>
        <button className={'tab' + (tab === 'sales' ? ' active' : '')} onClick={() => setTab('sales')}>
          سجلّ المبيعات ({sales.length})
        </button>
        <button className={'tab' + (tab === 'prices' ? ' active' : '')} onClick={() => setTab('prices')}>
          قائمة الأسعار
        </button>
      </div>

      {loading && <div className="empty">...جارٍ التحميل</div>}

      {/* ============ نظرة عامة ============ */}
      {!loading && tab === 'overview' && (
        <>
          <div className="rv-cards">
            <div className="rv-card hero">
              <span className="rv-k">إجمالي الإيرادات</span>
              <div className="rv-v">{fmtMoney(stats.total)}</div>
              <div className="rv-sub">{stats.count} عملية بيع</div>
            </div>
            <div className="rv-card">
              <span className="rv-k">هذا الشهر</span>
              <div className="rv-v">{fmtMoney(stats.month)}</div>
              <div className="rv-sub">{stats.monthCount} عملية</div>
            </div>
            <div className="rv-card">
              <span className="rv-k">اليوم</span>
              <div className="rv-v">{fmtMoney(stats.today)}</div>
              <div className="rv-sub">{stats.todayCount} عملية</div>
            </div>
            <div className="rv-card">
              <span className="rv-k">متوسط البيع</span>
              <div className="rv-v">{fmtMoney(stats.avg)}</div>
              <div className="rv-sub">
                {stats.discounted > 0 ? `${stats.discounted} بيع بتخفيض` : 'بلا تخفيضات'}
              </div>
            </div>
          </div>

          <div className="rv-panel">
            <h3>الإيراد الشهري</h3>
            <p className="hint">آخر 6 أشهر — المبالغ المقبوضة فعلًا.</p>
            {stats.count === 0 ? (
              <div className="empty">لا مبيعات مسجّلة بعد. سجّل أول بيع من «إدارة الوصول» عند توليد رمز.</div>
            ) : (
              <div className="bars">
                {months.map((m) => (
                  <div className="bar-col" key={m.key}>
                    <span className="bar-amt">{m.total ? m.total.toLocaleString('ar-DZ') : ''}</span>
                    <div className="bar" style={{ height: `${Math.round((m.total / maxMonth) * 100)}%` }} />
                    <span className="bar-lbl">{m.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="split">
            <div className="rv-panel">
              <h3>حسب المستوى</h3>
              <p className="hint">أين يأتي المال فعلًا.</p>
              {byLevel.length === 0 ? <div className="empty">—</div> : byLevel.map((r) => (
                <div className="mini-row" key={r.key}>
                  <span>{levelLabel(r.key)}</span>
                  <span className="mini-bar">
                    <i style={{ width: `${Math.round((r.total / (byLevel[0].total || 1)) * 100)}%` }} />
                  </span>
                  <span className="mini-amt">{fmtMoney(r.total)}</span>
                </div>
              ))}
            </div>

            <div className="rv-panel">
              <h3>حسب المادة</h3>
              <p className="hint">العرض الكامل يُحتسب صفًّا مستقلًّا.</p>
              {byModule.length === 0 ? <div className="empty">—</div> : byModule.map((r) => (
                <div className="mini-row" key={r.key}>
                  <span>{moduleLabelOrBundle(r.key)}</span>
                  <span className="mini-bar">
                    <i style={{ width: `${Math.round((r.total / (byModule[0].total || 1)) * 100)}%` }} />
                  </span>
                  <span className="mini-amt">{fmtMoney(r.total)}</span>
                </div>
              ))}
            </div>
          </div>

          {stats.unredeemedCount > 0 && (
            <div className="rv-panel">
              <h3>دفعوا ولم يفعّلوا رمزهم ({stats.unredeemedCount})</h3>
              <p className="hint">
                {fmtMoney(stats.unredeemedAmount)} مقبوضة لرموز لم يستعملها أصحابها بعد — تستحق رسالة تذكير.
              </p>
              <div className="scroll-x">
                <table className="tbl">
                  <thead>
                    <tr><th>الطالب</th><th>الرمز</th><th>المبلغ</th><th>تاريخ الدفع</th><th></th></tr>
                  </thead>
                  <tbody>
                    {unpaidFollowUp.map((s) => (
                      <tr key={s.id}>
                        <td>{s.student?.name || '—'}</td>
                        <td><span className="code-chip">{s.code || '—'}</span></td>
                        <td className="amt">{fmtMoney(s.amount)}</td>
                        <td>{fmtDate(s.paidAt)}</td>
                        <td>
                          {s.student?.phone && (
                            <a
                              className="btn-wa"
                              href={waLink(
                                s.student.phone,
                                `السلام عليكم ${s.student.name || ''}،\nرمزك على منصة المخ: ${s.code}\nلم نلاحظ تفعيله بعد — أدخله من «لدي رمز» وستُفتح لك الدروس مباشرة. بالتوفيق 🙏`
                              )}
                              target="_blank"
                              rel="noreferrer"
                            >
                              واتساب
                            </a>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* ============ رموز بلا بيع مسجَّل ============ */}
      {!loading && tab === 'overview' && missing.length > 0 && (
        <div className="rv-panel" style={{ borderColor: 'rgba(227,162,60,.7)' }}>
          <h3>⚠️ رموز بلا بيع مسجَّل ({missing.length})</h3>
          <p className="hint">
            رموز أُنشئت من «اعتماد طلب» أو من مولّد «المادة كاملة» — تلك الشاشات
            لا تمرّ على نموذج البيع، فدخلها غير محسوب في الأرقام أعلاه.
            سجّل كلًّا منها بنقرة ليدخل التقرير (يُنسب إلى تاريخ إنشاء الرمز).
          </p>
          <div className="scroll-x">
            <table className="tbl">
              <thead>
                <tr><th>الرمز</th><th>العرض</th><th>الملاحظة</th><th>أُنشئ</th><th>السعر المقترح</th><th></th></tr>
              </thead>
              <tbody>
                {missing.slice(0, 25).map((c) => {
                  const sug = priceFor(prices, c.offer.level, c.offer.module, c.offer.scope);
                  return (
                    <tr key={c.id}>
                      <td><span className="code-chip">{c.id}</span></td>
                      <td style={{ fontSize: 12.5 }}>
                        {levelLabel(c.offer.level)} · {moduleLabelOrBundle(c.offer.module)}
                        <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                          {scopeLabel(c.offer.scope)}{c.offer.group ? ` · ${c.offer.group}` : ''}
                        </div>
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--muted)' }}>{c.note || '—'}</td>
                      <td style={{ fontSize: 12 }}>{fmtDate(c.createdAt)}</td>
                      <td className="amt">{sug == null ? '—' : fmtMoney(sug)}</td>
                      <td>
                        <button className="btn btn-gold" onClick={() => openRecord(c)} disabled={busy}>
                          سجّل بيعًا
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {missing.length > 25 && (
            <p className="hint" style={{ marginTop: 12, marginBottom: 0 }}>
              …و{missing.length - 25} رمزًا آخر. سجّل هذه أولًا ثم أعد تحميل الصفحة.
            </p>
          )}
        </div>
      )}

      {recordFor && (
        <div className="rv-modal-back" onClick={() => setRecordFor(null)}>
          <div className="rv-modal" onClick={(e) => e.stopPropagation()}>
            <h3>تسجيل بيع للرمز <span className="code-chip">{recordFor.id}</span></h3>
            <p className="hint">
              {levelLabel(recordFor.offer.level)} · {moduleLabelOrBundle(recordFor.offer.module)} ·{' '}
              {scopeLabel(recordFor.offer.scope)}
            </p>
            <div className="fld">
              <label>المبلغ المقبوض (دج)</label>
              <input className="inp" dir="ltr" type="number" min="0" step="100"
                value={rAmount} onChange={(e) => setRAmount(e.target.value)} autoFocus />
            </div>
            <div className="fld">
              <label>اسم الطالب (اختياري)</label>
              <input className="inp" value={rName} onChange={(e) => setRName(e.target.value)} />
            </div>
            <div className="fld">
              <label>رقم الهاتف (اختياري)</label>
              <input className="inp" dir="ltr" value={rPhone} onChange={(e) => setRPhone(e.target.value)} />
            </div>
            <div className="fld">
              <label>طريقة الدفع</label>
              <select className="inp" value={rMethod} onChange={(e) => setRMethod(e.target.value)}>
                {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button className="btn btn-gold" onClick={saveRecord} disabled={busy}>
                {busy ? '...جارٍ الحفظ' : 'حفظ البيع'}
              </button>
              <button className="btn btn-ghost" onClick={() => setRecordFor(null)} disabled={busy}>إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* ============ سجلّ المبيعات ============ */}
      {!loading && tab === 'sales' && (
        <div className="rv-panel">
          <h3>كل المبيعات</h3>
          <p className="hint">
            مرتّبة من الأحدث. «فُعِّل» يعني أن طالبًا استعمل الرمز فعلًا — تُحسب من usedBy وليست حالة مخزّنة.
          </p>
          {sales.length === 0 ? (
            <div className="empty">لا مبيعات بعد.</div>
          ) : (
            <div className="scroll-x">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>الطالب</th><th>العرض</th><th>الرمز</th><th>المبلغ</th>
                    <th>الدفع</th><th>التاريخ</th><th>الحالة</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {sales.map((s) => {
                    const cut = s.listPrice != null && Number(s.amount) < Number(s.listPrice);
                    return (
                      <tr key={s.id}>
                        <td>
                          <b>{s.student?.name || '—'}</b>
                          {s.student?.phone && (
                            <div style={{ fontSize: 11.5, color: 'var(--muted)', direction: 'ltr', textAlign: 'right' }}>
                              {s.student.phone}
                            </div>
                          )}
                        </td>
                        <td style={{ fontSize: 12.5 }}>
                          {levelLabel(s.level)} · {moduleLabelOrBundle(s.module)}
                          <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                            {scopeLabel(s.scope)}{s.group ? ` · ${s.group}` : ''}
                          </div>
                        </td>
                        <td><span className="code-chip">{s.code || '—'}</span></td>
                        <td className={'amt' + (cut ? ' cut' : '')}>
                          {fmtMoney(s.amount)}
                          {cut && (
                            <div style={{ fontSize: 10.5, fontWeight: 400 }}>
                              من {fmtMoney(s.listPrice)}
                            </div>
                          )}
                        </td>
                        <td style={{ fontSize: 12 }}>{methodLabel(s.method)}</td>
                        <td style={{ fontSize: 12 }}>{fmtDate(s.paidAt)}</td>
                        <td>
                          {!s.codeExists ? (
                            <span className="pill pill-dead">الرمز محذوف</span>
                          ) : s.redeemed ? (
                            <span className="pill pill-ok">فُعِّل ✓</span>
                          ) : (
                            <span className="pill pill-wait">لم يُفعَّل</span>
                          )}
                        </td>
                        <td>
                          <button className="btn btn-no" onClick={() => removeSale(s)} disabled={busy}>
                            حذف
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ============ قائمة الأسعار ============ */}
      {!loading && tab === 'prices' && (
        <div className="rv-panel">
          <h3>قائمة الأسعار</h3>
          <p className="hint">
            الأسعار مأخوذة من صفحة «الأسعار» في الموقع، ويُطبَّق السعر تلقائيًا عند
            توليد الرمز. العرض بلا سعر يُطالِب بإدخال المبلغ يدويًا وقت البيع —
            لم نخمّن سعرًا غير معلن. كل الوحدات/الفصول داخل المستوى تأخذ السعر نفسه.
          </p>
          <p className="hint" style={{ color: '#8c2a20' }}>
            ⚠️ الموقع مشروع منفصل: إن غيّرت سعرًا في صفحة الأسعار، غيّره هنا أيضًا.
          </p>

          {(() => {
            const groups = new Map();
            for (const o of offers) {
              if (!groups.has(o.level)) groups.set(o.level, []);
              groups.get(o.level).push(o);
            }
            return Array.from(groups.entries()).map(([level, rows]) => (
              <div key={level}>
                <div className="price-group">{levelLabel(level)}</div>
                <div className="price-grid">
                  {rows.map((o) => (
                    <React.Fragment key={o.key}>
                      <span className="price-lbl">
                        {moduleLabelOrBundle(o.module)} · {scopeLabel(o.scope)}
                        {savedPrices[o.key] != null &&
                          Number(savedPrices[o.key]) !== Number(LANDING_PRICES[o.key]) && (
                            <span className="src-tag src-edit">معدَّل</span>
                          )}
                        {savedPrices[o.key] == null && LANDING_PRICES[o.key] != null && (
                          <span className="src-tag">من الموقع</span>
                        )}
                        {savedPrices[o.key] == null && LANDING_PRICES[o.key] == null && (
                          <span className="src-tag src-none">غير معلن</span>
                        )}
                      </span>
                      <input
                        className="price-inp"
                        type="number"
                        min="0"
                        step="100"
                        placeholder="—"
                        value={draftPrices[o.key] ?? ''}
                        onChange={(e) =>
                          setDraftPrices((p) => ({ ...p, [o.key]: e.target.value }))
                        }
                      />
                    </React.Fragment>
                  ))}
                </div>
              </div>
            ));
          })()}

          <div className="save-bar">
            <button className="btn btn-gold" onClick={savePrices} disabled={busy || !priceDirty}>
              {busy ? '...جارٍ الحفظ' : 'حفظ الأسعار'}
            </button>
            {priceDirty && (
              <button className="btn btn-ghost" onClick={() => setDraftPrices(prices)} disabled={busy}>
                تراجع
              </button>
            )}
            {!priceDirty && <span className="hint" style={{ margin: 0 }}>لا تغييرات غير محفوظة.</span>}
          </div>
        </div>
      )}
    </AdminLayout>
  );
}

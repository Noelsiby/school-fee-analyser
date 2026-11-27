/**
 * A fee receipt for one or more payments of one family (brothers & sisters together).
 *   📲 Send to parent  free on the Student App; WhatsApp if the family isn't on the app
 *   💬 WhatsApp / ✉️ SMS  opens Deepa's own WhatsApp or SMS with the receipt typed in
 *   🖨 Print, 📋 Copy
 */
import { useEffect, useState } from 'react';
import { useApi } from '../../hooks/useApi';
import { rupees } from './tuition';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const dateLabel = (d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
const VIA = { app: 'on the Student App', whatsapp: 'on WhatsApp' };

export default function ReceiptModal({ paymentIds, earlier = {}, onClose, onSent, justPaid = false }) {
  const { apiCall } = useApi();
  const [r, setR] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);   // { via, reason }
  const [copied, setCopied] = useState(false);
  const ids = paymentIds.join(',');
  const before = Object.entries(earlier).map(([k, v]) => `${k}:${v}`).join(',');

  useEffect(() => { apiCall(`/api/tuition/fees/receipt?ids=${ids}${before ? `&earlier=${before}` : ''}`).then((d) => setR(d.receipt)).catch((e) => setError(e.message)); }, [apiCall, ids, before]);

  const send = async () => {
    setBusy(true); setError('');
    try {
      const d = await apiCall('/api/tuition/fees/receipt', { method: 'POST', body: { paymentIds, earlier } });
      setResult(d);
      if (d.via !== 'none') onSent?.();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  const print = () => {
    const w = window.open('', '_blank', 'width=520,height=700');
    if (!w) return;
    w.document.write(`<html><head><title>Fee receipt ${esc(r.number)}</title></head>
      <body style="font-family:Helvetica,Arial,sans-serif;color:#111;padding:28px;max-width:460px;margin:auto">
      <div style="border:1.5px solid #111;border-radius:8px;padding:20px">
        <div style="display:flex;justify-content:space-between;align-items:baseline"><h2 style="margin:0">${esc(r.payeeName)}</h2><span>${esc(r.number)}</span></div>
        <p style="margin:4px 0 14px;letter-spacing:.08em;font-size:13px">FEE RECEIPT</p>
        <p style="margin:0 0 10px">Date: <b>${esc(dateLabel(r.paidOn))}</b>${r.modes ? ` · Paid by <b>${esc(r.modes)}</b>` : ''}</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          <tr><th align="left" style="border-bottom:1px solid #111;padding:6px 0">Student</th><th align="left" style="border-bottom:1px solid #111">Month</th><th align="right" style="border-bottom:1px solid #111">Amount</th></tr>
          ${r.items.map((i) => `<tr><td style="padding:6px 0;border-bottom:1px solid #ddd">${esc(i.name)}<br><small>${esc(i.tuitionClass)}</small></td><td style="border-bottom:1px solid #ddd">${esc(i.monthLabel)}</td><td align="right" style="border-bottom:1px solid #ddd">${esc(rupees(i.paidNow))}${i.before ? `<br><small>+ ${esc(rupees(i.before))} paid before</small>` : i.amount < i.fee ? `<br><small>part of ${esc(rupees(i.fee))}</small>` : ''}</td></tr>`).join('')}
          <tr><td colspan="2" style="padding:8px 0"><b>Total received</b></td><td align="right"><b>${esc(rupees(r.total))}</b></td></tr>
        </table>
        <p style="margin:26px 0 0;display:flex;justify-content:space-between"><span>Thank you.</span><span style="border-top:1px solid #111;padding-top:4px;min-width:140px;text-align:center">Signature</span></p>
      </div><script>window.onload=()=>window.print()</script></body></html>`);
    w.document.close();
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(r.text); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* not allowed */ }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
        <div className="modal-header">
          <h2 className="modal-title">🧾 {justPaid ? 'Saved. Send the receipt?' : 'Fee receipt'}</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {error && <div className="alert alert-error" style={{ marginBottom: 10 }}>⚠ {error}</div>}
        {!r ? !error && <div className="spinner spinner-dark" /> : (
          <>
            <div className="tu-receipt">
              <div className="tu-receipt-head"><strong>{r.payeeName}</strong><span>{r.number}</span></div>
              <p className="tu-muted">{dateLabel(r.paidOn)}{r.modes ? ` · ${r.modes}` : ''}</p>
              {r.items.map((i) => (
                <div key={i.paymentId} className="tu-receipt-line">
                  <span>{i.name} <small>· {i.monthLabel}</small></span>
                  <strong>{rupees(i.paidNow)}{i.before > 0 ? <small> + {rupees(i.before)} before</small> : i.amount < i.fee && <small> of {rupees(i.fee)}</small>}</strong>
                </div>
              ))}
              <div className="tu-receipt-line tu-receipt-total"><span>Total received</span><strong>{rupees(r.total)}</strong></div>
            </div>

            {result ? (
              result.via === 'none'
                ? <div className="alert alert-warning" style={{ margin: '10px 0' }}>⚠ {result.reason}</div>
                : <div className="alert alert-success" style={{ margin: '10px 0' }}>✓ Sent to the parent {VIA[result.via]}.</div>
            ) : r.sentAt && (
              <p className="tu-muted" style={{ margin: '10px 0' }}>✓ Already sent {VIA[r.sentVia] || ''} on {dateLabel(r.sentAt)}. You can send it again.</p>
            )}
            {!r.phone && <p className="tu-muted" style={{ margin: '10px 0' }}>⚠ No parent number on the school profile, so it can only be printed.</p>}

            <div className="tu-receipt-actions">
              {r.phone && <button className="btn btn-primary" onClick={send} disabled={busy}>{busy ? <span className="spinner" /> : '📲 Send to parent'}</button>}
              {r.phone && <a className="btn btn-ghost" href={`https://wa.me/${r.phone}?text=${encodeURIComponent(r.text)}`} target="_blank" rel="noreferrer">💬 WhatsApp</a>}
              {r.phone && <a className="btn btn-ghost" href={`sms:+${r.phone}?body=${encodeURIComponent(r.text)}`}>✉️ SMS</a>}
              <button className="btn btn-ghost" onClick={print}>🖨 Print</button>
              <button className="btn btn-ghost" onClick={copy}>{copied ? '✓ Copied' : '📋 Copy'}</button>
            </div>
            <p className="tu-muted" style={{ marginTop: 8, fontSize: '0.78rem' }}>
              <strong>Send to parent</strong> goes free on the Student App, or on WhatsApp if the family doesn't use the app.
              <strong> WhatsApp</strong> and <strong>SMS</strong> open your own phone's app with the receipt typed in.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

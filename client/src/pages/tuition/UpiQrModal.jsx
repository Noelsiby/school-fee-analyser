/**
 * GPay / UPI QR for tuition fees. Parents scan it with GPay, PhonePe, Paytm or any UPI app.
 * Deepa enters her UPI ID once (GPay → Profile → UPI ID, e.g. 85920xxxxx@okaxis). An amount can be
 * filled in so the parent's app shows it ready to pay.
 */
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { useApi } from '../../hooks/useApi';
import { rupees } from './tuition';

const upiLink = ({ upiId, payeeName, amount, note }) => {
  const p = new URLSearchParams({ pa: upiId, pn: payeeName || 'Matha School Tuition', cu: 'INR' });
  if (Number(amount) > 0) p.set('am', String(Number(amount)));
  if (note) p.set('tn', note.slice(0, 50));
  return `upi://pay?${p.toString()}`;
};

export default function UpiQrModal({ onClose, amount: presetAmount = '', note: presetNote = '' }) {
  const { apiCall } = useApi();
  const [settings, setSettings] = useState(null);
  const [editing, setEditing] = useState(false);
  const [upiId, setUpiId] = useState('');
  const [payeeName, setPayeeName] = useState('');
  const [amount, setAmount] = useState(String(presetAmount || ''));
  const [note, setNote] = useState(presetNote);
  const [qr, setQr] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiCall('/api/tuition/settings').then((d) => {
      setSettings(d.settings); setUpiId(d.settings.upiId); setPayeeName(d.settings.payeeName);
      if (!d.settings.upiId) setEditing(true);
    }).catch((e) => setError(e.message));
  }, [apiCall]);

  useEffect(() => {
    if (!settings?.upiId) { setQr(''); return; }
    QRCode.toDataURL(upiLink({ upiId: settings.upiId, payeeName: settings.payeeName, amount, note }), { margin: 1, width: 360 })
      .then(setQr).catch(() => setQr(''));
  }, [settings, amount, note]);

  const save = async () => {
    setBusy(true); setError('');
    try {
      const d = await apiCall('/api/tuition/settings', { method: 'PUT', body: { upiId, payeeName } });
      setSettings(d.settings); setEditing(false);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  const print = () => {
    const w = window.open('', '_blank', 'width=480,height=640');
    if (!w) return;
    w.document.write(`<html><head><title>Tuition fee QR</title></head><body style="font-family:sans-serif;text-align:center;padding:24px">
      <h2 style="margin:0 0 4px">${settings.payeeName}</h2><p style="margin:0 0 12px;color:#555">Scan with GPay / PhonePe / any UPI app</p>
      <img src="${qr}" style="width:300px;height:300px" /><p style="font-size:18px;margin:8px 0">${settings.upiId}</p>
      ${Number(amount) > 0 ? `<p style="font-size:22px;font-weight:bold">${rupees(amount)}</p>` : ''}${note ? `<p>${note.replace(/</g, '&lt;')}</p>` : ''}
      <script>window.onload=()=>window.print()</script></body></html>`);
    w.document.close();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
        <div className="modal-header">
          <h2 className="modal-title">📱 GPay / UPI QR</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {error && <div className="alert alert-error" style={{ marginBottom: 10 }}>⚠ {error}</div>}
        {!settings ? <div className="spinner spinner-dark" /> : editing ? (
          <>
            <p className="tu-muted" style={{ marginBottom: 10 }}>Type your <strong>UPI ID</strong> once. In GPay: tap your photo → <em>UPI ID</em> (it looks like <code>85920xxxxx@okaxis</code>).</p>
            <div className="form-group">
              <label className="form-label">UPI ID</label>
              <input className="form-input" value={upiId} onChange={(e) => setUpiId(e.target.value.trim())} placeholder="e.g. 8592065715@okaxis" autoFocus />
            </div>
            <div className="form-group">
              <label className="form-label">Name shown to parents</label>
              <input className="form-input" value={payeeName} onChange={(e) => setPayeeName(e.target.value)} />
            </div>
            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              {settings.upiId && <button className="btn btn-ghost" onClick={() => setEditing(false)}>Cancel</button>}
              <button className="btn btn-primary" disabled={busy || !upiId} onClick={save}>{busy ? <span className="spinner" /> : 'Save'}</button>
            </div>
          </>
        ) : (
          <div style={{ textAlign: 'center' }}>
            {qr && <img src={qr} alt="UPI QR code for tuition fees" style={{ width: 260, height: 260 }} />}
            <p style={{ margin: '4px 0', fontWeight: 700 }}>{settings.payeeName}</p>
            <p className="tu-muted">{settings.upiId} · <button className="link-btn" onClick={() => setEditing(true)}>change</button></p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', margin: '12px 0', flexWrap: 'wrap' }}>
              <input className="form-input" type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount (optional)" style={{ maxWidth: 160 }} aria-label="Amount" />
              <input className="form-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note, e.g. name + month" style={{ maxWidth: 200 }} aria-label="Note" />
            </div>
            <p className="tu-muted">Parents scan this with GPay, PhonePe, Paytm or any UPI app.{Number(amount) > 0 ? ` The amount ${rupees(amount)} is filled in for them.` : ''}</p>
            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
              <button className="btn btn-ghost" onClick={print}>🖨 Print QR</button>
              <a className="btn btn-primary" href={qr} download="tuition-fee-qr.png">⬇ Save image</a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

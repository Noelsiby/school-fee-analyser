/**
 * Take a student's photo with the laptop webcam or the phone camera.
 * Live picture with a passport-shaped guide → "Take photo" → check it → "Use this photo" / "Retake".
 * If there is no camera (or it isn't allowed), the person can still choose a photo file.
 *
 * Props: onUse(blob) → Promise (upload; the camera waits until it finishes)
 *        onCancel()   (optional; shows a Cancel button)
 *        title        (who the photo is for)
 *        useLabel     (button text, default "Use this photo")
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { captureFrame, resizePhoto } from '../../utils/photo';
import './CameraCapture.css';

export default function CameraCapture({ onUse, onCancel, title, useLabel = 'Use this photo' }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const fileRef = useRef(null);
  const [facing, setFacing] = useState('user');    // user = front camera, environment = back camera
  const [cameras, setCameras] = useState(0);
  const [state, setState] = useState('starting');  // starting | live | preview | error
  const [shot, setShot] = useState(null);          // { blob, url }
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const stop = () => { streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null; };

  const start = useCallback(async () => {
    stop();
    setState('starting'); setError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setState('error'); setError('This browser cannot use the camera here. Choose a photo file instead.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play().catch(() => {}); }
      setState('live');
      navigator.mediaDevices.enumerateDevices().then((d) => setCameras(d.filter((x) => x.kind === 'videoinput').length)).catch(() => {});
    } catch (e) {
      setState('error');
      setError(e.name === 'NotAllowedError'
        ? 'The camera is blocked. Allow the camera for this site (the camera icon in the address bar), or choose a photo file.'
        : e.name === 'NotFoundError' ? 'No camera found on this device. Choose a photo file instead.'
        : 'The camera could not start. Close other apps using it, or choose a photo file.');
    }
  }, [facing]);

  useEffect(() => { start(); return stop; }, [start]);
  useEffect(() => () => { if (shot) URL.revokeObjectURL(shot.url); }, [shot]);

  const take = async () => {
    try {
      const blob = await captureFrame(videoRef.current, facing === 'user');
      setShot({ blob, url: URL.createObjectURL(blob) });
      setState('preview');
    } catch (e) { setError(e.message); }
  };

  const fromFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const blob = await resizePhoto(file);
      setShot({ blob, url: URL.createObjectURL(blob) });
      setState('preview');
    } catch (err) { setError(err.message); }
  };

  const use = async () => {
    setBusy(true); setError('');
    try { await onUse(shot.blob); setShot(null); setState(streamRef.current ? 'live' : 'error'); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  const retake = () => { setShot(null); setState(streamRef.current ? 'live' : 'error'); };

  return (
    <div className="cam">
      {title && <div className="cam-title">{title}</div>}
      <div className="cam-stage">
        <video ref={videoRef} playsInline muted className={`cam-video${facing === 'user' ? ' cam-mirror' : ''}`}
          style={{ visibility: state === 'live' ? 'visible' : 'hidden' }} />
        {state === 'live' && <div className="cam-guide" aria-hidden="true" />}
        {state === 'preview' && shot && <img src={shot.url} alt="Photo taken" className="cam-shot" />}
        {state === 'starting' && <div className="cam-msg"><span className="spinner" /> Starting the camera…</div>}
        {state === 'error' && <div className="cam-msg">📷 {error}</div>}
      </div>
      {error && state !== 'error' && <div className="alert alert-error" style={{ marginTop: 8 }}>⚠ {error}</div>}

      <div className="cam-actions">
        {state === 'preview' ? (
          <>
            <button className="btn btn-ghost" disabled={busy} onClick={retake}>↺ Retake</button>
            <button className="btn btn-primary" disabled={busy} onClick={use}>{busy ? <span className="spinner" /> : `✓ ${useLabel}`}</button>
          </>
        ) : (
          <>
            {onCancel && <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>}
            <button className="btn btn-ghost" onClick={() => fileRef.current?.click()}>Choose file</button>
            {cameras > 1 && state === 'live' && (
              <button className="btn btn-ghost" onClick={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))}>🔄 Switch camera</button>
            )}
            <button className="btn btn-primary cam-take" disabled={state !== 'live'} onClick={take}>📷 Take photo</button>
          </>
        )}
      </div>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={fromFile} />
    </div>
  );
}

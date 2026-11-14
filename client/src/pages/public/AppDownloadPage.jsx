/**
 * AppDownloadPage — portal.mathaschool.in/app (public).
 * The page parents open from the QR slip or WhatsApp invite: download the Android app
 * (not on the Play Store, so the file comes straight from the school) and how to install it.
 */
import { useEffect, useState } from 'react';
import schoolLogo from '../../assets/school-logo.png';

const STEPS = [
  ['Tap “Download the app”.', 'If Chrome says the file might be harmful, tap “Download anyway”. The app comes from the school, not the Play Store, so phones warn about it.'],
  ['Open the downloaded file.', 'Tap the download in the notification bar, or open Files → Downloads and tap “Matha-School.apk”.'],
  ['Allow the install.', 'If the phone asks, tap “Settings”, turn on “Allow from this source”, go back and tap “Install”.'],
  ['If Play Protect warns you,', 'tap “More details” → “Install anyway”.'],
  ['Open the Matha School app.', 'Enter the parent mobile number and the 6-digit code from the school, then choose a 4-digit PIN.'],
];

export default function AppDownloadPage() {
  const [info, setInfo] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    document.title = 'Matha School app';
    fetch('/api/app/version')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setInfo)
      .catch(() => setFailed(true));
  }, []);

  return (
    <main className="dl-page">
      <style>{CSS}</style>
      <header className="dl-head">
        <img src={schoolLogo} alt="Matha English Medium School" className="dl-logo" />
        <h1>Matha School app</h1>
        <p>For parents: results, attendance, timetable and school notices for all your children, in one app.</p>
      </header>

      <section className="dl-card dl-get">
        {failed ? (
          <p className="dl-muted">Couldn't load the download. Please check your internet and refresh this page.</p>
        ) : !info ? (
          <p className="dl-muted">Loading…</p>
        ) : info.apkUrl ? (
          <>
            <a className="dl-btn" href={info.apkUrl}>⬇ Download the app</a>
            <p className="dl-muted">For Android phones{info.latestVersion ? ` · version ${info.latestVersion}` : ''}</p>
          </>
        ) : (
          <p className="dl-muted">The app will be available here soon.</p>
        )}
      </section>

      <section className="dl-card">
        <h2>How to install</h2>
        <ol className="dl-steps">
          {STEPS.map(([lead, more]) => (
            <li key={lead}><strong>{lead}</strong> {more}</li>
          ))}
        </ol>
      </section>

      <section className="dl-card">
        <h2>Good to know</h2>
        <ul className="dl-notes">
          <li><strong>Brothers and sisters:</strong> one login for the parent number shows all your children.</li>
          <li><strong>New version:</strong> when the app says a new version is available, come back here and download again. You stay signed in.</li>
          <li><strong>iPhone:</strong> the app is only for Android phones for now.</li>
          <li><strong>No code, or forgot your PIN?</strong> Please contact the school office.</li>
        </ul>
      </section>
    </main>
  );
}

const CSS = `
  .dl-page { min-height: 100vh; background: #f1f5f9; padding: 24px 16px 40px; font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; color: #0f172a; }
  .dl-page > * { max-width: 520px; margin-left: auto; margin-right: auto; }
  .dl-head { text-align: center; margin-bottom: 18px; }
  .dl-logo { width: 96px; height: 96px; object-fit: contain; }
  .dl-head h1 { margin: 10px 0 6px; font-size: 26px; color: #1e3a8a; }
  .dl-head p { margin: 0; color: #475569; line-height: 1.5; }
  .dl-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 14px; padding: 18px; margin-bottom: 14px; }
  .dl-card h2 { margin: 0 0 10px; font-size: 18px; color: #1e3a8a; }
  .dl-get { text-align: center; }
  .dl-btn { display: block; background: #1e3a8a; color: #fff; text-decoration: none; font-weight: 700; font-size: 18px; padding: 16px; border-radius: 12px; }
  .dl-btn:active { background: #172554; }
  .dl-muted { color: #64748b; margin: 10px 0 0; }
  .dl-steps, .dl-notes { margin: 0; padding-left: 22px; line-height: 1.55; }
  .dl-steps li, .dl-notes li { margin-bottom: 10px; }
  .dl-steps li:last-child, .dl-notes li:last-child { margin-bottom: 0; }
`;

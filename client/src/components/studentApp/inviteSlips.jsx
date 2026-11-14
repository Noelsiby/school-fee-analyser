/**
 * Printable Student App invite slips: one per family, four to an A4 page, to cut out
 * and hand to students. Each slip has the QR code for the download link, the parent's
 * mobile number, the one-time activation code and three simple steps.
 */
import { Document, Page, View, Text, Image, StyleSheet, pdf } from '@react-pdf/renderer';
import QRCode from 'qrcode';
import schoolLogo from '../../assets/school-logo-report.jpg';
import { SCHOOL } from '../../utils/school';

const NAVY = '#1e3a8a', GOLD = '#d4a017', MUTED = '#64748b', LINE = '#94a3b8';

const s = StyleSheet.create({
  page: { padding: 18, fontFamily: 'Helvetica', fontSize: 9, color: '#0f172a', flexDirection: 'row', flexWrap: 'wrap' },
  // A4 (595 × 842 pt) minus the page padding → four slips of 279 × 402 pt
  slip: { width: 279, height: 402, padding: 12, borderWidth: 1, borderColor: LINE, borderStyle: 'dashed' },
  head: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  logo: { width: 30, height: 33, marginRight: 8 },
  school: { fontFamily: 'Helvetica-Bold', fontSize: 10.5, color: NAVY },
  app: { fontSize: 8.5, color: MUTED },
  rule: { height: 2, backgroundColor: GOLD, marginBottom: 7 },
  for: { fontSize: 8, color: MUTED },
  kids: { fontFamily: 'Helvetica-Bold', fontSize: 10, marginBottom: 7 },
  row: { flexDirection: 'row' },
  qrBox: { alignItems: 'center', marginRight: 10 },
  qr: { width: 92, height: 92 },
  qrText: { fontSize: 7, color: MUTED, marginTop: 2 },
  label: { fontSize: 7.5, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.5 },
  value: { fontFamily: 'Helvetica-Bold', fontSize: 12, marginBottom: 5 },
  code: { fontFamily: 'Helvetica-Bold', fontSize: 18, letterSpacing: 3, color: NAVY, marginBottom: 2 },
  expiry: { fontSize: 7, color: MUTED },
  steps: { marginTop: 8, borderTopWidth: 1, borderTopColor: '#e2e8f0', paddingTop: 6 },
  step: { fontSize: 8.5, marginBottom: 3 },
  stepNo: { fontFamily: 'Helvetica-Bold', color: NAVY },
  foot: { fontSize: 7, color: MUTED, marginTop: 4 },
});

const fmt = (d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

function Slip({ invite, qr }) {
  return (
    <View style={s.slip} wrap={false}>
      <View style={s.head}>
        <Image src={schoolLogo} style={s.logo} />
        <View>
          <Text style={s.school}>{SCHOOL.name}</Text>
          <Text style={s.app}>Student App: results, attendance, timetable and notices</Text>
        </View>
      </View>
      <View style={s.rule} />
      <Text style={s.for}>For the parent of</Text>
      <Text style={s.kids}>{invite.children.map((c) => `${c.name} (${c.className})`).join(', ')}</Text>
      <View style={s.row}>
        <View style={s.qrBox}>
          {qr ? <Image src={qr} style={s.qr} /> : <Text style={s.qrText}>(download link not set)</Text>}
          <Text style={s.qrText}>Scan to download</Text>
        </View>
        <View>
          <Text style={s.label}>Your mobile number</Text>
          <Text style={s.value}>{invite.display}</Text>
          <Text style={s.label}>Activation code</Text>
          <Text style={s.code}>{invite.code}</Text>
          <Text style={s.expiry}>Use before {fmt(invite.codeExpires)}. Works only once.</Text>
        </View>
      </View>
      <View style={s.steps}>
        <Text style={s.step}><Text style={s.stepNo}>1. </Text>Scan the QR code and install the app.</Text>
        <Text style={s.step}><Text style={s.stepNo}>2. </Text>Open it, tap "First time? Activate", enter this mobile number and the code.</Text>
        <Text style={s.step}><Text style={s.stepNo}>3. </Text>Choose a 4-digit PIN. Next time, log in with your number and PIN.</Text>
      </View>
      <Text style={s.foot}>Keep this code private. Lost it or forgot your PIN? Contact the school: {SCHOOL.phones.join(', ')}.</Text>
    </View>
  );
}

const safe = (x) => String(x).replace(/[^a-zA-Z0-9_\- ]/g, '').trim().replace(/\s+/g, '_');

/** Build the slips PDF and download it. */
export async function downloadInviteSlips(invites, downloadUrl, name = 'Student_App_invites') {
  const qr = downloadUrl ? await QRCode.toDataURL(downloadUrl, { margin: 1, width: 300 }) : null;
  const pages = [];
  for (let i = 0; i < invites.length; i += 4) pages.push(invites.slice(i, i + 4));
  const doc = (
    <Document title="Student App invites" author={SCHOOL.name}>
      {pages.map((group, i) => (
        <Page key={i} size="A4" style={s.page}>
          {group.map((inv) => <Slip key={inv.phone} invite={inv} qr={qr} />)}
        </Page>
      ))}
    </Document>
  );
  const blob = await pdf(doc).toBlob();
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: `${safe(name)}.pdf` });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

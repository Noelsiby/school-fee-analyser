/**
 * One-page Progress Sheet PDF for parent–teacher meetings: progress graph,
 * subjects, strengths, targets, notes and achievements. Built in the browser.
 */
import { Document, Page, View, Text, Image, StyleSheet, Svg, Polyline, Line, Circle, pdf } from '@react-pdf/renderer';
import schoolLogo from '../../assets/school-logo-report.jpg';
import { SCHOOL } from '../../utils/school';

const NAVY = '#1e3a8a', GOLD = '#d4a017', INK = '#0f172a', MUTED = '#64748b', LINE = '#cbd5e1';

const s = StyleSheet.create({
  page: { padding: 28, fontFamily: 'Helvetica', fontSize: 9, color: INK },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  logo: { width: 48, height: 53, marginRight: 10 },
  school: { flex: 1, alignItems: 'center' },
  schoolName: { fontFamily: 'Helvetica-Bold', fontSize: 15, color: NAVY },
  place: { fontSize: 8, color: MUTED, marginTop: 2 },
  pill: { backgroundColor: NAVY, color: 'white', fontFamily: 'Helvetica-Bold', fontSize: 8.5, paddingVertical: 3, paddingHorizontal: 7, borderRadius: 3 },
  rule: { height: 2.5, backgroundColor: GOLD, marginBottom: 10 },
  who: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  name: { fontFamily: 'Helvetica-Bold', fontSize: 13, color: NAVY },
  meta: { color: MUTED, fontSize: 8.5, marginTop: 2 },
  summary: { backgroundColor: '#eef2ff', padding: 8, borderRadius: 4, marginBottom: 10 },
  h: { fontFamily: 'Helvetica-Bold', fontSize: 9, color: NAVY, textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 4 },
  box: { borderWidth: 1, borderColor: LINE, borderRadius: 4, padding: 8, marginBottom: 10 },
  tr: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: LINE, minHeight: 15, alignItems: 'center' },
  th: { backgroundColor: NAVY, color: 'white', fontFamily: 'Helvetica-Bold', fontSize: 7.5, paddingVertical: 3, textAlign: 'center' },
  td: { fontSize: 8.5, paddingVertical: 2.5, textAlign: 'center' },
  two: { flexDirection: 'row', gap: 10 },
  col: { flex: 1 },
  item: { marginBottom: 3 },
  legend: { flexDirection: 'row', gap: 12, fontSize: 7.5, color: MUTED, marginTop: 2 },
  footer: { position: 'absolute', bottom: 14, left: 28, right: 28, flexDirection: 'row', justifyContent: 'space-between', fontSize: 7, color: '#94a3b8' },
  signs: { flexDirection: 'row', marginTop: 'auto', paddingTop: 16 },
  sign: { flex: 1, alignItems: 'center', marginHorizontal: 12 },
  signLine: { borderTopWidth: 1, borderTopColor: INK, width: '100%', marginBottom: 3 },
});

const signed = (n) => (n === null || n === undefined ? '—' : `${n > 0 ? '+' : ''}${n}%`);

function Chart({ exams, passMark }) {
  const pts = exams.filter((e) => e.complete);
  const W = 520, H = 120, L = 24, R = 10, T = 10, B = 22;
  const x = (i) => L + (pts.length === 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (pts.length - 1));
  const y = (v) => T + (1 - v / 100) * (H - T - B);
  const line = (key) => pts.map((p, i) => (p[key] === null ? null : `${x(i)},${y(p[key])}`)).filter(Boolean).join(' ');
  return (
    <View>
      <Svg width={W} height={H}>
        {[0, 50, 100].map((v) => <Line key={v} x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="#e2e8f0" strokeWidth={0.8} />)}
        <Line x1={L} x2={W - R} y1={y(passMark)} y2={y(passMark)} stroke="#ef4444" strokeWidth={0.8} strokeDasharray="2 3" />
        <Polyline points={line('classAverage')} stroke="#94a3b8" strokeWidth={1.2} strokeDasharray="4 3" fill="none" />
        <Polyline points={line('percentage')} stroke={NAVY} strokeWidth={2} fill="none" />
        {pts.map((p, i) => <Circle key={i} cx={x(i)} cy={y(p.percentage)} r={2.8} fill="white" stroke={NAVY} strokeWidth={1.6} />)}
      </Svg>
      <View style={{ position: 'relative', width: W, height: 12 }}>
        {pts.map((p, i) => (
          <Text key={i} style={{ position: 'absolute', left: x(i) - 40, width: 80, fontSize: 7, textAlign: 'center', color: MUTED }}>
            {p.examName.length > 16 ? `${p.examName.slice(0, 15)}…` : p.examName} · {Math.round(p.percentage)}%
          </Text>
        ))}
      </View>
      <View style={[s.legend, { marginTop: 4 }]}>
        <Text>— Student</Text><Text>- - Class average</Text><Text style={{ color: '#ef4444' }}>··· Pass mark {passMark}%</Text>
      </View>
    </View>
  );
}

function Sheet({ student, analysis: a, notes }) {
  const generated = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const cols = [['Subject', '24%'], ['Average', '13%'], ['Latest', '17%'], ['Change', '12%'], ['vs Class', '12%'], ['Next grade', '22%']];
  return (
    <Document title={`${student.name} — Progress Sheet`} author={SCHOOL.name}>
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <Image src={schoolLogo} style={s.logo} />
          <View style={s.school}>
            <Text style={s.schoolName}>{SCHOOL.name.toUpperCase()}</Text>
            <Text style={s.place}>{SCHOOL.address}</Text>
            <Text style={s.place}>Ph: {SCHOOL.phones.join('  ·  ')}</Text>
          </View>
          <Text style={s.pill}>PROGRESS SHEET</Text>
        </View>
        <View style={s.rule} />

        <View style={s.who}>
          <View>
            <Text style={s.name}>{student.name}</Text>
            <Text style={s.meta}>{student.className} · Roll No. {student.rollNumber} · Academic Year {SCHOOL.academicYear}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            {a.latest && <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 12, color: NAVY }}>{a.latest.percentage}% · {a.latest.grade}</Text>}
            {a.latest?.position && <Text style={s.meta}>{a.latest.position}{a.latest.rank ? ` (rank ${a.latest.rank} of ${a.latest.rankedCount})` : ''}</Text>}
          </View>
        </View>

        {a.summary ? <Text style={s.summary}>{a.summary.replace(/→/g, 'to')}</Text> : null}

        <Text style={s.h}>Progress across exams</Text>
        <View style={s.box}><Chart exams={a.exams} passMark={a.passMark} /></View>

        <Text style={s.h}>Subjects</Text>
        <View style={[s.box, { padding: 0 }]}>
          <View style={[s.tr, { borderBottomWidth: 0 }]}>{cols.map(([c, w]) => <Text key={c} style={[s.th, { width: w }]}>{c}</Text>)}</View>
          {a.subjects.map((x) => (
            <View key={x.name} style={s.tr}>
              <Text style={[s.td, { width: '24%', textAlign: 'left', paddingLeft: 6, fontFamily: 'Helvetica-Bold' }]}>{x.name}</Text>
              <Text style={[s.td, { width: '13%' }]}>{x.average === null ? '—' : `${x.average}%`}</Text>
              <Text style={[s.td, { width: '17%' }]}>{x.latest ? `${x.latest.total}/${x.latest.maxMarks} (${x.latest.grade})` : '—'}</Text>
              <Text style={[s.td, { width: '12%' }]}>{signed(x.change)}</Text>
              <Text style={[s.td, { width: '12%' }]}>{signed(x.vsClass)}</Text>
              <Text style={[s.td, { width: '22%' }]}>{x.nextGrades[0] ? (x.nextGrades[0].marksNeeded === 0 ? `At ${x.nextGrades[0].grade}` : `+${x.nextGrades[0].marksNeeded} for ${x.nextGrades[0].grade}`) : 'Top grade'}</Text>
            </View>
          ))}
        </View>

        <View style={s.two}>
          <View style={[s.box, s.col]}>
            <Text style={s.h}>Strengths and focus</Text>
            <Text style={s.item}>Strong: {a.strengths.length ? a.strengths.join(', ') : '—'}</Text>
            <Text style={s.item}>Needs focus: {a.weaknesses.length ? a.weaknesses.join(', ') : '—'}</Text>
            {a.parts.filter((p) => p.weakest).map((p) => <Text key={p.subject} style={s.item}>{p.subject}: weakest part is {p.weakest}</Text>)}
            {a.consistency && <Text style={s.item}>Consistency: {a.consistency.label}</Text>}
          </View>
          <View style={[s.box, s.col]}>
            <Text style={s.h}>Achievements</Text>
            {a.achievements.length ? a.achievements.map((x, i) => <Text key={i} style={s.item}>• {x.text}</Text>) : <Text style={{ color: MUTED }}>—</Text>}
            {a.flags.length > 0 && <Text style={[s.h, { marginTop: 6 }]}>Needs attention</Text>}
            {a.flags.map((f, i) => <Text key={i} style={[s.item, { color: '#b91c1c' }]}>• {f.text}</Text>)}
          </View>
        </View>

        <Text style={s.h}>Teacher notes</Text>
        <View style={s.box}>
          {notes.length === 0 ? <Text style={{ color: MUTED }}>—</Text> : notes.slice(0, 5).map((n) => (
            <Text key={n.id} style={s.item}>
              • {n.subject ? `${n.subject}: ` : ''}{n.text}
              {n.followUp ? `  (since then: ${n.followUp.from}% to ${n.followUp.to}%)` : ''}
            </Text>
          ))}
        </View>

        <View style={s.signs}>
          <View style={s.sign}><View style={s.signLine} /><Text>Class Teacher</Text></View>
          <View style={s.sign}><View style={s.signLine} /><Text>Principal</Text></View>
          <View style={s.sign}><View style={s.signLine} /><Text>Parent / Guardian</Text></View>
        </View>

        <View style={s.footer} fixed>
          <Text>{SCHOOL.name} · {student.className} · Roll {student.rollNumber}</Text>
          <Text>Generated on {generated}</Text>
        </View>
      </Page>
    </Document>
  );
}

const safe = (x) => String(x).replace(/[^a-zA-Z0-9_\- ]/g, '').trim().replace(/\s+/g, '_');

export async function downloadProgressSheet(data) {
  const blob = await pdf(<Sheet {...data} />).toBlob();
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: `${safe(data.student.name)}_Progress_Sheet.pdf` });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

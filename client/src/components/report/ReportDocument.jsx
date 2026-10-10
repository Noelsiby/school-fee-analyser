import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import schoolLogo from '../../assets/school-logo-report.jpg'; // small JPEG copy so multi-page PDFs stay light
import { SCHOOL, formatDate, ageFrom } from '../../utils/school';
import { BANDS } from '../../utils/grades';

/*
 * Progress report PDF: one A4 page per student.
 * `report` is the response of GET /api/students/reports/exams/:examId/classes/:classId?photos=1
 */

const NAVY = '#1e3a8a';
const GOLD = '#d4a017';
const INK = '#0f172a';
const MUTED = '#64748b';
const LINE = '#cbd5e1';
const SOFT = '#f1f5f9';

const PARTS = ['Reading', 'Writing', 'Dictation'];

const s = StyleSheet.create({
  page: { padding: 26, fontFamily: 'Helvetica', fontSize: 8.5, color: INK },

  // Header
  header: { flexDirection: 'row', alignItems: 'center', paddingBottom: 8 },
  logo: { width: 52, height: 58, marginRight: 10 },
  schoolBlock: { flex: 1 },
  schoolName: { fontFamily: 'Helvetica-Bold', fontSize: 17, color: NAVY, letterSpacing: 0.4 },
  schoolPlace: { fontSize: 8.5, color: MUTED, marginTop: 2 },
  titleBlock: { alignItems: 'flex-end' },
  titlePill: { backgroundColor: NAVY, color: 'white', fontFamily: 'Helvetica-Bold', fontSize: 9, paddingVertical: 3, paddingHorizontal: 8, borderRadius: 3, letterSpacing: 1 },
  examName: { fontFamily: 'Helvetica-Bold', fontSize: 10, marginTop: 4, color: INK },
  year: { fontSize: 8, color: MUTED, marginTop: 1 },
  goldRule: { height: 2.5, backgroundColor: GOLD, marginBottom: 10 },

  sectionTitle: { fontFamily: 'Helvetica-Bold', fontSize: 9, color: NAVY, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.8 },

  // Student details
  bio: { flexDirection: 'row', borderWidth: 1, borderColor: LINE, borderRadius: 4, padding: 8, marginBottom: 10 },
  photoBox: { width: 74, height: 90, borderWidth: 1, borderColor: LINE, borderRadius: 3, marginLeft: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: SOFT },
  photo: { width: 72, height: 88, objectFit: 'cover', borderRadius: 2 },
  bioGrid: { flex: 1, flexDirection: 'row', flexWrap: 'wrap' },
  field: { width: '33.33%', paddingRight: 6, marginBottom: 5 },
  fieldWide: { width: '100%', paddingRight: 6, marginBottom: 5 },
  label: { fontSize: 6.5, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.5 },
  value: { fontFamily: 'Helvetica-Bold', fontSize: 9, marginTop: 1, minHeight: 11 },
  studentName: { fontFamily: 'Helvetica-Bold', fontSize: 12.5, color: NAVY, marginTop: 1 },

  // Marks table
  table: { borderWidth: 1, borderColor: LINE, borderRadius: 4, marginBottom: 10 },
  tr: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: LINE, minHeight: 17, alignItems: 'center' },
  th: { backgroundColor: NAVY, color: 'white', fontFamily: 'Helvetica-Bold', fontSize: 7.5, textAlign: 'center', paddingVertical: 4 },
  td: { textAlign: 'center', paddingVertical: 3, fontSize: 8.5 },
  colSubject: { width: '22%', textAlign: 'left', paddingLeft: 6 },
  colPart: { width: '11%' },
  colTotal: { width: '12%' },
  colGrade: { width: '9%' },
  colPoints: { width: '12%' },
  zebra: { backgroundColor: '#f8fafc' },
  totalRow: { backgroundColor: '#e0e7ff', fontFamily: 'Helvetica-Bold' },
  dash: { color: '#94a3b8' },
  of: { color: MUTED, fontSize: 7 },

  // Summary
  summary: { flexDirection: 'row', marginBottom: 10 },
  card: { flex: 1, borderWidth: 1, borderColor: LINE, borderRadius: 4, paddingVertical: 6, alignItems: 'center', marginRight: 6 },
  cardLast: { marginRight: 0 },
  cardValue: { fontFamily: 'Helvetica-Bold', fontSize: 13, color: NAVY },
  cardLabel: { fontSize: 6.5, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 },

  // Attendance + remarks
  twoCol: { flexDirection: 'row', marginBottom: 10 },
  attendance: { flex: 1.15, marginRight: 8 },
  remarks: { flex: 1 },
  blankRow: { minHeight: 17 },
  remarkLine: { borderBottomWidth: 1, borderBottomColor: LINE, height: 19 },

  // Grade scale
  scale: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 14, borderWidth: 1, borderColor: LINE, borderRadius: 4, padding: 5, backgroundColor: SOFT },
  scaleItem: { width: '25%', fontSize: 7, color: MUTED, paddingVertical: 1 },
  scaleGrade: { fontFamily: 'Helvetica-Bold', color: INK },

  // Signatures
  signatures: { flexDirection: 'row', marginTop: 'auto', paddingTop: 14 },
  sign: { flex: 1, alignItems: 'center', marginHorizontal: 10 },
  signLine: { borderTopWidth: 1, borderTopColor: INK, width: '100%', marginBottom: 3 },
  signLabel: { fontFamily: 'Helvetica-Bold', fontSize: 8 },
  signName: { fontSize: 7, color: MUTED, marginTop: 1 },

  footer: { position: 'absolute', bottom: 12, left: 26, right: 26, flexDirection: 'row', justifyContent: 'space-between', fontSize: 6.5, color: '#94a3b8' },
});

const show = (v) => (v === null || v === undefined || v === '' ? null : String(v));

function Field({ label, value, wide }) {
  return (
    <View style={wide ? s.fieldWide : s.field}>
      <Text style={s.label}>{label}</Text>
      <Text style={s.value}>{show(value) ?? ' '}</Text>
    </View>
  );
}

function Cell({ value, of, style }) {
  if (value === null || value === undefined) return <Text style={[s.td, style, s.dash]}>—</Text>;
  return (
    <Text style={[s.td, style]}>
      {value}{of !== undefined && <Text style={s.of}> /{of}</Text>}
    </Text>
  );
}

function StudentPage({ report, result, generatedOn }) {
  const st = result.student;
  return (
    <Page size="A4" style={s.page}>
      {/* Header */}
      <View style={s.header}>
        <Image src={schoolLogo} style={s.logo} />
        <View style={s.schoolBlock}>
          <Text style={s.schoolName}>{SCHOOL.name.toUpperCase()}</Text>
          <Text style={s.schoolPlace}>{SCHOOL.address}</Text>
          <Text style={s.schoolPlace}>Ph: {SCHOOL.phones.join('  ·  ')}</Text>
        </View>
        <View style={s.titleBlock}>
          <Text style={s.titlePill}>PROGRESS REPORT</Text>
          <Text style={s.examName}>{report.exam.name}</Text>
          <Text style={s.year}>Academic Year {SCHOOL.academicYear}</Text>
        </View>
      </View>
      <View style={s.goldRule} />

      {/* Student details */}
      <Text style={s.sectionTitle}>Student Details</Text>
      <View style={s.bio}>
        <View style={s.bioGrid}>
          <View style={s.fieldWide}>
            <Text style={s.label}>Name</Text>
            <Text style={s.studentName}>{st.name}</Text>
          </View>
          <Field label="Father's / Guardian's Name" value={st.fatherName} />
          <Field label="Class" value={report.class.name} />
          <Field label="Section" value={st.section} />
          <Field label="Roll No." value={st.rollNumber} />
          <Field label="Admission No." value={st.admissionNo} />
          <Field label="Admission Date" value={formatDate(st.admissionDate)} />
          <Field label="Date of Birth" value={formatDate(st.dateOfBirth)} />
          <Field label="Age" value={ageFrom(st.dateOfBirth)} />
          <Field label="Blood Group" value={st.bloodGroup} />
          <Field label="Identification Mark 1" value={st.idMark1} />
          <Field label="Identification Mark 2" value={st.idMark2} />
          <Field label="Aadhaar No." value={st.aadhaarNo} />
          <Field label="APAAR No." value={st.apaarNo} />
          <Field label="Phone (Res.)" value={st.phoneRes} />
          <Field label="Cell" value={st.parentPhone} />
          <Field label="Address" value={st.address} wide />
        </View>
        <View style={s.photoBox}>
          {st.photo ? <Image src={st.photo} style={s.photo} /> : <Text style={{ color: MUTED, fontSize: 7 }}>Photo</Text>}
        </View>
      </View>

      {/* Marks */}
      <Text style={s.sectionTitle}>Academic Performance — {report.exam.name}</Text>
      <View style={s.table}>
        <View style={[s.tr, { borderBottomWidth: 0 }]}>
          <Text style={[s.th, s.colSubject, { textAlign: 'left' }]}>Subject</Text>
          <Text style={[s.th, s.colPart]}>Marks</Text>
          {PARTS.map((p) => <Text key={p} style={[s.th, s.colPart]}>{p}</Text>)}
          <Text style={[s.th, s.colTotal]}>Total</Text>
          <Text style={[s.th, s.colGrade]}>Grade</Text>
          <Text style={[s.th, s.colPoints]}>Points</Text>
        </View>
        {report.subjects.map((sub, i) => {
          const r = result.subjects[i];
          const cmm = sub.componentMaxMarks;
          return (
            <View key={sub.id} style={[s.tr, i % 2 ? s.zebra : null]}>
              <Text style={[s.td, s.colSubject, { fontFamily: 'Helvetica-Bold' }]}>{sub.name}</Text>
              <Cell value={r.main} of={cmm ? cmm.Main : sub.maxMarks} style={s.colPart} />
              {PARTS.map((p) => (
                <Cell key={p} value={cmm && p in cmm ? r.parts[p] : null} of={cmm && p in cmm ? cmm[p] : undefined} style={s.colPart} />
              ))}
              <Cell value={r.total} of={sub.maxMarks} style={[s.colTotal, { fontFamily: 'Helvetica-Bold' }]} />
              <Cell value={r.grade} style={[s.colGrade, { fontFamily: 'Helvetica-Bold' }]} />
              <Cell value={r.points} style={s.colPoints} />
            </View>
          );
        })}
        <View style={[s.tr, s.totalRow, { borderBottomWidth: 0 }]}>
          <Text style={[s.td, s.colSubject, { fontFamily: 'Helvetica-Bold' }]}>TOTAL</Text>
          <Text style={[s.td, { width: '44%' }]} />
          <Cell value={result.total} of={result.maxTotal} style={[s.colTotal, { fontFamily: 'Helvetica-Bold' }]} />
          <Cell value={result.grade} style={[s.colGrade, { fontFamily: 'Helvetica-Bold' }]} />
          <Cell value={result.gpa} style={[s.colPoints, { fontFamily: 'Helvetica-Bold' }]} />
        </View>
      </View>

      {/* Summary */}
      <View style={s.summary}>
        <View style={s.card}><Text style={s.cardValue}>{result.total !== null ? `${result.total}/${result.maxTotal}` : '—'}</Text><Text style={s.cardLabel}>Total Marks</Text></View>
        <View style={s.card}><Text style={s.cardValue}>{result.percentage !== null ? `${result.percentage}%` : '—'}</Text><Text style={s.cardLabel}>Percentage</Text></View>
        <View style={s.card}><Text style={s.cardValue}>{show(result.gpa) ?? '—'}</Text><Text style={s.cardLabel}>Average Points (GPA)</Text></View>
        <View style={s.card}><Text style={s.cardValue}>{show(result.grade) ?? '—'}</Text><Text style={s.cardLabel}>Average Grade</Text></View>
        <View style={[s.card, s.cardLast]}><Text style={s.cardValue}>{show(report.highestGpa) ?? '—'}</Text><Text style={s.cardLabel}>Highest GPA in Class</Text></View>
      </View>

      {/* Attendance (filled in by hand) + remarks */}
      <View style={s.twoCol}>
        <View style={s.attendance}>
          <Text style={s.sectionTitle}>Attendance</Text>
          <View style={s.table}>
            <View style={[s.tr, { borderBottomWidth: 0 }]}>
              <Text style={[s.th, { width: '34%' }]}>Month</Text>
              <Text style={[s.th, { width: '33%' }]}>Working Days</Text>
              <Text style={[s.th, { width: '33%' }]}>Days Present</Text>
            </View>
            {[0, 1, 2].map((k) => (
              <View key={k} style={[s.tr, s.blankRow]}>
                <Text style={{ width: '34%', borderRightWidth: 1, borderRightColor: LINE, height: '100%' }} />
                <Text style={{ width: '33%', borderRightWidth: 1, borderRightColor: LINE, height: '100%' }} />
                <Text style={{ width: '33%' }} />
              </View>
            ))}
            <View style={[s.tr, s.blankRow, s.totalRow, { borderBottomWidth: 0 }]}>
              <Text style={[s.td, { width: '34%', borderRightWidth: 1, borderRightColor: LINE }]}>TOTAL</Text>
              <Text style={{ width: '33%', borderRightWidth: 1, borderRightColor: LINE, height: '100%' }} />
              <Text style={{ width: '33%' }} />
            </View>
          </View>
        </View>
        <View style={s.remarks}>
          <Text style={s.sectionTitle}>Remarks</Text>
          {[0, 1, 2, 3].map((k) => <View key={k} style={s.remarkLine} />)}
        </View>
      </View>

      {/* Grade scale */}
      <View style={s.scale}>
        {BANDS.map((b, i) => {
          const upper = i === 0 ? 100 : BANDS[i - 1].min - 1;
          const range = b.min === 0 ? `Below ${BANDS[i - 1].min}` : `${b.min}–${upper}`;
          return (
            <Text key={b.grade} style={s.scaleItem}>
              <Text style={s.scaleGrade}>{b.grade}</Text>  {range}%  ·  {b.points} pts
            </Text>
          );
        })}
      </View>

      {/* Signatures */}
      <View style={s.signatures}>
        <View style={s.sign}>
          <View style={s.signLine} />
          <Text style={s.signLabel}>Class Teacher</Text>
          {report.class.classTeacher && <Text style={s.signName}>{report.class.classTeacher}</Text>}
        </View>
        <View style={s.sign}>
          <View style={s.signLine} />
          <Text style={s.signLabel}>Principal / Headmaster</Text>
        </View>
        <View style={s.sign}>
          <View style={s.signLine} />
          <Text style={s.signLabel}>Parent / Guardian</Text>
        </View>
      </View>

      <View style={s.footer} fixed>
        <Text>{SCHOOL.name} · {report.class.name} · Roll {st.rollNumber}</Text>
        <Text>Generated on {generatedOn}</Text>
      </View>
    </Page>
  );
}

export default function ReportDocument({ report }) {
  const generatedOn = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  return (
    <Document title={`${report.exam.name} — ${report.class.name} — Progress Report`} author={SCHOOL.name}>
      {report.results.map((result) => (
        <StudentPage key={result.student.id} report={report} result={result} generatedOn={generatedOn} />
      ))}
    </Document>
  );
}

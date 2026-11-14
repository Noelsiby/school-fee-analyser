// The child's details as the school has them (read-only). Aadhaar/APAAR are masked.
import { useLoad } from '../lib/useLoad';
import { Screen, Card, Title, Muted, Row, Loading, ErrorBox } from '../components/ui';

const date = (d) => (d ? new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : null);

export default function Profile() {
  const { data: p, error, refreshing, refresh } = useLoad('/profile');
  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      {error ? <ErrorBox message={error} onRetry={refresh} /> : !p ? <Loading /> : (
        <>
          <Card>
            <Title>School</Title>
            <Row label="Class" value={p.className} />
            <Row label="Roll number" value={p.rollNumber} />
            <Row label="Section" value={p.section} />
            <Row label="Class teacher" value={p.classTeacher} />
            <Row label="Admission no." value={p.admissionNo} />
            <Row label="Admission date" value={date(p.admissionDate)} />
          </Card>
          <Card>
            <Title>Student</Title>
            <Row label="Name" value={p.name} strong />
            <Row label="Father / guardian" value={p.fatherName} />
            <Row label="Date of birth" value={date(p.dateOfBirth)} />
            <Row label="Blood group" value={p.bloodGroup} />
            <Row label="Identification mark 1" value={p.idMark1} />
            <Row label="Identification mark 2" value={p.idMark2} />
            <Row label="Aadhaar" value={p.aadhaarNo} />
            <Row label="APAAR" value={p.apaarNo} />
          </Card>
          <Card>
            <Title>Contact</Title>
            <Row label="Parent mobile" value={p.parentPhone} />
            <Row label="Phone (home)" value={p.phoneRes} />
            <Row label="Address" value={p.address} />
          </Card>
          <Muted style={{ textAlign: 'center' }}>Something wrong? Please tell the class teacher or the school office.</Muted>
        </>
      )}
    </Screen>
  );
}

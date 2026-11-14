// Progress: graph across exams, strengths, what to work on, next-grade targets, achievements.
import { View, Text } from 'react-native';
import { useLoad } from '../../lib/useLoad';
import { C } from '../../lib/theme';
import { Screen, Card, Title, Muted, GradeBadge, Loading, ErrorBox } from '../../components/ui';
import ProgressChart from '../../components/ProgressChart';

const signed = (n) => (n === null || n === undefined ? '—' : `${n > 0 ? '+' : ''}${n}%`);

export default function Progress() {
  const { data: a, error, refreshing, refresh } = useLoad('/progress');

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      {error ? <ErrorBox message={error} onRetry={refresh} /> : !a ? <Loading /> : a.exams.length === 0 ? (
        <Card><Muted>Progress appears after the first published exam.</Muted></Card>
      ) : (
        <>
          {!!a.summary && <Card style={{ backgroundColor: C.navyLight, borderColor: C.navyLight }}><Text style={{ color: C.ink, lineHeight: 21 }}>{a.summary}</Text></Card>}

          <Card>
            <Title>Across exams</Title>
            <ProgressChart exams={a.exams} passMark={a.passMark} />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
              {a.latest?.position && <Stat label="Class position" value={a.latest.position} />}
              {a.rankChange && <Stat label="Rank" value={`${a.rankChange.from} → ${a.rankChange.to}`} />}
              {a.personalBest && <Stat label="Personal best" value={`${a.personalBest.percentage}%`} />}
              {a.consistency && <Stat label="Consistency" value={a.consistency.label} />}
            </View>
          </Card>

          {a.achievements.length > 0 && (
            <Card>
              <Title>🏅 Achievements</Title>
              {a.achievements.map((x, i) => <Text key={i} style={{ paddingVertical: 4, color: C.ink }}>{x.icon} {x.text}</Text>)}
            </Card>
          )}

          <Card>
            <Title>Subjects</Title>
            {a.strengths.length > 0 && <Text style={{ color: '#166534', marginBottom: 4 }}>💪 Strong: {a.strengths.join(', ')}</Text>}
            {a.weaknesses.length > 0 && <Text style={{ color: '#92400e', marginBottom: 8 }}>🎯 Work on: {a.weaknesses.join(', ')}</Text>}
            {a.subjects.map((s) => (
              <View key={s.name} style={{ paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ flex: 1, fontWeight: '700', color: C.ink }}>{s.name}</Text>
                  {s.latest && <Text style={{ color: C.ink }}>{s.latest.total}/{s.latest.maxMarks}</Text>}
                  {s.latest && <GradeBadge grade={s.latest.grade} />}
                </View>
                <Muted style={{ marginTop: 3 }}>
                  Average {s.average ?? '—'}% · Change {signed(s.change)} · vs class {signed(s.vsClass)}
                </Muted>
                {s.nextGrades[0] && (
                  <Text style={{ color: C.navy, marginTop: 3, fontSize: 13 }}>
                    🎯 {s.nextGrades[0].marksNeeded === 0 ? `Just reached ${s.nextGrades[0].grade}` : `${s.nextGrades[0].marksNeeded} more marks for ${s.nextGrades[0].grade}`}
                  </Text>
                )}
              </View>
            ))}
          </Card>

          {a.parts.length > 0 && (
            <Card>
              <Title>Reading · Writing · Dictation</Title>
              {a.parts.map((p) => (
                <Text key={p.subject} style={{ paddingVertical: 4, color: C.ink }}>
                  <Text style={{ fontWeight: '700' }}>{p.subject}: </Text>
                  {p.parts.map((x) => `${x.part === 'Main' ? 'Main' : x.part} ${x.average}%`).join(' · ')}
                  {p.weakest ? <Text style={{ color: C.amber }}> (practise {p.weakest})</Text> : null}
                </Text>
              ))}
            </Card>
          )}
        </>
      )}
    </Screen>
  );
}

function Stat({ label, value }) {
  return (
    <View style={{ backgroundColor: C.bg, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12 }}>
      <Text style={{ fontSize: 11, color: C.muted }}>{label}</Text>
      <Text style={{ fontWeight: '800', color: C.navy }}>{value}</Text>
    </View>
  );
}

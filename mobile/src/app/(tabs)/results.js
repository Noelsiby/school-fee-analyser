// Results: every published exam; tap one to see the subjects.
import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useLoad } from '../../lib/useLoad';
import { C } from '../../lib/theme';
import { Screen, Card, Muted, GradeBadge, Loading, ErrorBox } from '../../components/ui';

function Subject({ sub, passMark }) {
  const pct = sub.total === null || !sub.maxMarks ? null : (sub.total / sub.maxMarks) * 100;
  const low = pct !== null && Math.round(pct) < passMark;
  const parts = sub.parts ? Object.entries(sub.parts).filter(([, v]) => v !== null) : [];
  return (
    <View style={{ paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={{ flex: 1, fontWeight: '700', color: C.ink }}>{sub.name}</Text>
        <Text style={{ fontWeight: '700', color: low ? C.red : C.ink }}>{sub.total ?? '—'}<Text style={{ color: C.faint, fontWeight: '400' }}> / {sub.maxMarks}</Text></Text>
        <GradeBadge grade={sub.grade} />
      </View>
      {parts.length > 0 && (
        <Muted style={{ marginTop: 3 }}>
          Main {sub.main ?? '—'}{sub.partMax?.Main ? `/${sub.partMax.Main}` : ''} · {parts.map(([k, v]) => `${k} ${v}${sub.partMax?.[k] ? `/${sub.partMax[k]}` : ''}`).join(' · ')}
        </Muted>
      )}
    </View>
  );
}

export default function Results() {
  const { data, error, refreshing, refresh } = useLoad('/results');
  const [open, setOpen] = useState(0);

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      {error ? <ErrorBox message={error} onRetry={refresh} /> : !data ? <Loading /> : data.results.length === 0 ? (
        <Card><Muted>No results published yet. They appear here when the school publishes an exam.</Muted></Card>
      ) : data.results.map((r, i) => (
        <Card key={r.examId}>
          <Pressable onPress={() => setOpen(open === i ? -1 : i)} accessibilityRole="button">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: '800', color: C.ink }}>{r.examName}</Text>
                <Muted style={{ marginTop: 2 }}>{r.total}/{r.maxTotal} marks{r.rank ? ` · Rank ${r.rank} of ${r.rankedCount}` : ''}</Muted>
              </View>
              <Text style={{ fontSize: 22, fontWeight: '800', color: C.navy }}>{r.percentage}%</Text>
              <GradeBadge grade={r.grade} />
            </View>
          </Pressable>
          {open === i && (
            <View style={{ marginTop: 10 }}>
              {r.subjects.map((sub) => <Subject key={sub.name} sub={sub} passMark={data.passMark} />)}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }}>
                <Muted>GPA {r.gpa ?? '—'}</Muted>
                {r.classAverage !== null && <Muted>Class average {r.classAverage}%</Muted>}
              </View>
            </View>
          )}
          {open !== i && <Text style={{ color: C.navy, fontWeight: '700', marginTop: 8 }}>Show subjects ›</Text>}
        </Card>
      ))}
    </Screen>
  );
}

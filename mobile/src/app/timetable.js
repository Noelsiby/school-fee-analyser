// The class timetable, one day at a time (today first).
import { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { useLoad } from '../lib/useLoad';
import { C } from '../lib/theme';
import { Screen, Card, Muted, Loading, ErrorBox } from '../components/ui';

export default function Timetable() {
  const { data, error, refreshing, refresh } = useLoad('/timetable');
  const [day, setDay] = useState(null);
  useEffect(() => {
    if (data && day === null) setDay(data.days.some((d) => d.day === data.today) ? data.today : data.days[0]?.day ?? null);
  }, [data, day]);
  const current = data?.days.find((d) => d.day === day);
  const empty = data && data.days.every((d) => d.periods.every((p) => p.isBreak || !p.subject));

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      {error ? <ErrorBox message={error} onRetry={refresh} /> : !data ? <Loading /> : empty ? (
        <Card><Muted>The timetable hasn't been set yet.</Muted></Card>
      ) : (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {data.days.map((d) => (
              <Pressable key={d.day} onPress={() => setDay(d.day)} accessibilityRole="button"
                style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: d.day === day ? C.navy : C.card, borderWidth: 1, borderColor: d.day === day ? C.navy : C.line }}>
                <Text style={{ color: d.day === day ? '#fff' : C.ink, fontWeight: '700' }}>{d.name.slice(0, 3)}{d.day === data.today ? ' • Today' : ''}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <Card style={{ paddingVertical: 4 }}>
            {current?.periods.length ? current.periods.map((p) => (
              <View key={p.key} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', gap: 12, opacity: p.isBreak ? 0.6 : 1 }}>
                <View style={{ width: 82 }}>
                  <Text style={{ fontWeight: '700', color: C.navy }}>{p.label}</Text>
                  {p.start && <Muted>{p.start}{p.end ? `–${p.end}` : ''}</Muted>}
                </View>
                <View style={{ flex: 1 }}>
                  {p.isBreak ? <Text style={{ color: C.muted }}>Break</Text> : (
                    <>
                      <Text style={{ fontWeight: '700', color: C.ink }}>{p.subject || '—'}</Text>
                      {p.teacher && <Muted>{p.teacher}</Muted>}
                    </>
                  )}
                </View>
              </View>
            )) : <Muted style={{ paddingVertical: 12 }}>No periods on this day.</Muted>}
          </Card>
        </>
      )}
    </Screen>
  );
}

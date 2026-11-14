// Home: today's attendance, latest result and the newest school notices.
import { View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useLoad } from '../../lib/useLoad';
import { C } from '../../lib/theme';
import { Screen, Card, Title, Muted, GradeBadge, Loading, ErrorBox } from '../../components/ui';

const TODAY = {
  present: { text: 'Present today', fg: '#166534', bg: C.greenBg, icon: '✅' },
  absent: { text: 'Absent today', fg: '#991b1b', bg: C.redBg, icon: '❌' },
  partial: { text: 'Present for part of the day', fg: '#92400e', bg: C.amberBg, icon: '🕐' },
  leave: { text: 'On leave today', fg: '#1e40af', bg: C.blueBg, icon: '📝' },
};

export default function Home() {
  const { data, error, refreshing, refresh } = useLoad('/home');
  const router = useRouter();
  const t = data?.today;
  const state = t && (t.holiday ? { text: `Holiday: ${t.holiday}`, fg: C.muted, bg: C.line, icon: '🏖️' }
    : t.weeklyOff ? { text: 'No school today', fg: C.muted, bg: C.line, icon: '🏖️' }
    : TODAY[t.attendance] || { text: 'Attendance not taken yet', fg: C.muted, bg: C.line, icon: '⏳' });
  const r = data?.latestResult;

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      {error ? <ErrorBox message={error} onRetry={refresh} /> : !data ? <Loading /> : (
        <>
          <Card style={{ backgroundColor: state.bg, borderColor: state.bg }}>
            <Text style={{ fontSize: 13, color: state.fg }}>{t.dateLabel}</Text>
            <Text style={{ fontSize: 18, fontWeight: '800', color: state.fg, marginTop: 4 }}>{state.icon} {state.text}</Text>
            {data.attendanceThisYear?.percent !== null && data.attendanceThisYear?.percent !== undefined && (
              <Text style={{ color: state.fg, marginTop: 6 }}>Attendance this year: {data.attendanceThisYear.percent}%</Text>
            )}
          </Card>

          <Pressable onPress={() => router.push('/results')} accessibilityRole="button">
            <Card>
              <Title>Latest result</Title>
              {!r ? <Muted>No results published yet.</Muted> : (
                <>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: C.ink }}>{r.examName}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 }}>
                    <Text style={{ fontSize: 30, fontWeight: '800', color: C.navy }}>{r.percentage}%</Text>
                    <GradeBadge grade={r.grade} />
                  </View>
                  <Muted style={{ marginTop: 4 }}>
                    {r.total}/{r.maxTotal} marks{r.rank ? ` · Rank ${r.rank} of ${r.rankedCount}` : ''}
                  </Muted>
                  <Text style={{ color: C.navy, fontWeight: '700', marginTop: 10 }}>See all results ›</Text>
                </>
              )}
            </Card>
          </Pressable>

          <Card>
            <Title>School notices</Title>
            {data.notices.length === 0 ? <Muted>No notices yet.</Muted> : data.notices.map((n) => (
              <View key={n.id} style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' }}>
                <Text style={{ fontWeight: '700', color: C.ink }}>{n.title}</Text>
                <Text style={{ color: C.muted, marginTop: 2 }} numberOfLines={2}>{n.body}</Text>
              </View>
            ))}
            <Pressable onPress={() => router.push('/notices')} accessibilityRole="button">
              <Text style={{ color: C.navy, fontWeight: '700', marginTop: 10 }}>All notices ›</Text>
            </Pressable>
          </Card>
        </>
      )}
    </Screen>
  );
}

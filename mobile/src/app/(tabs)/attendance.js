// Attendance: month calendar with this month's and this year's %.
import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useLoad } from '../../lib/useLoad';
import { C } from '../../lib/theme';
import { Screen, Card, Title, Muted, Loading, ErrorBox } from '../../components/ui';

const HEAD = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const COLORS = {
  present: { bg: C.greenBg, fg: '#166534' },
  absent: { bg: C.redBg, fg: '#991b1b' },
  partial: { bg: C.amberBg, fg: '#92400e' },
  leave: { bg: C.blueBg, fg: '#1e40af' },
};
const shift = (m, by) => new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1 + by, 1)).toISOString().slice(0, 7);
const monthName = (m) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const pct = (t) => (t?.percent === null || t?.percent === undefined ? '—' : `${t.percent}%`);

export default function Attendance() {
  const [month, setMonth] = useState('');
  const { data, error, refreshing, refresh } = useLoad(`/attendance${month ? `?month=${month}` : ''}`);
  const m = month || data?.month;
  const lead = data?.days?.length ? data.days[0].weekday : 0;
  const notPresent = (data?.days || []).filter((d) => d.state && d.state !== 'present');

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      {error ? <ErrorBox message={error} onRetry={refresh} /> : !data ? <Loading /> : (
        <>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Card style={{ flex: 1 }}><Muted>{monthName(m)}</Muted><Text style={big}>{pct(data.monthTotal)}</Text><Muted>{data.monthTotal.present} of {data.monthTotal.days} days</Muted></Card>
            <Card style={{ flex: 1 }}><Muted>This school year</Muted><Text style={big}>{pct(data.yearTotal)}</Text><Muted>{data.yearTotal.present} of {data.yearTotal.days} days</Muted></Card>
          </View>

          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
              <Pressable onPress={() => setMonth(shift(m, -1))} style={nav} accessibilityLabel="Previous month"><Text style={navText}>‹</Text></Pressable>
              <Title style={{ flex: 1, textAlign: 'center', marginBottom: 0 }}>{monthName(m)}</Title>
              <Pressable onPress={() => setMonth(shift(m, 1))} style={nav} accessibilityLabel="Next month"><Text style={navText}>›</Text></Pressable>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {HEAD.map((h, i) => <Text key={`h${i}`} style={[cell, { color: C.faint, fontWeight: '700' }]}>{h}</Text>)}
              {Array.from({ length: lead }, (_, i) => <View key={`x${i}`} style={cell} />)}
              {data.days.map((d) => {
                const c = COLORS[d.state];
                const off = d.holiday || d.weeklyOff;
                return (
                  <View key={d.date} style={cell}>
                    <Text style={[day, c && { backgroundColor: c.bg, color: c.fg, fontWeight: '700' }, off && !c && { color: '#cbd5e1' }]}>{Number(d.date.slice(8))}</Text>
                  </View>
                );
              })}
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10 }}>
              {[['present', 'Present'], ['absent', 'Absent'], ['partial', 'Part of day'], ['leave', 'Leave']].map(([k, l]) => (
                <Text key={k} style={{ fontSize: 12, color: COLORS[k].fg }}>■ {l}</Text>
              ))}
            </View>
          </Card>

          {notPresent.length > 0 && (
            <Card>
              <Title>Days not fully present</Title>
              {notPresent.map((d) => (
                <Text key={d.date} style={{ paddingVertical: 4, color: C.ink }}>
                  {new Date(`${d.date}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })}: {d.state === 'leave' ? 'Leave' : d.state === 'partial' ? 'Part of the day' : 'Absent'}
                  {d.reason ? <Text style={{ color: C.muted }}> ({d.reason})</Text> : null}
                </Text>
              ))}
            </Card>
          )}
        </>
      )}
    </Screen>
  );
}

const big = { fontSize: 26, fontWeight: '800', color: C.navy, marginVertical: 2 };
const cell = { width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 3, textAlign: 'center' };
const day = { width: 34, height: 34, lineHeight: 34, borderRadius: 17, textAlign: 'center', color: C.ink, overflow: 'hidden' };
const nav = { paddingHorizontal: 14, paddingVertical: 4 };
const navText = { fontSize: 26, color: C.navy };

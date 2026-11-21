// 🔔 Everything the school has notified this family about (results, absences, notices).
// Opening the list marks them as read; tapping one opens that screen for the right child.
import { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { api } from '../lib/api';
import { useSession } from '../lib/session';
import { C } from '../lib/theme';
import { Screen, Card, Muted, Loading, ErrorBox } from '../components/ui';

const ICON = { result: '📊', absent: '❌', notice: '📢', fee: '🧾' };
const SCREEN = { results: '/results', attendance: '/attendance', notices: '/notices' };
const when = (d) => new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

export default function NotificationsScreen() {
  const router = useRouter();
  const { session, chooseChild } = useSession();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      setData(await api('/notifications'));
      await api('/notifications/read', { method: 'POST' });
    } catch (e) { setError(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const open = async (n) => {
    if (n.studentId && n.studentId !== session.childId && session.children.some((c) => c.id === n.studentId)) await chooseChild(n.studentId);
    const to = SCREEN[n.data?.screen];
    if (to) router.push(to);
  };
  const childName = (id) => session?.children?.find((c) => c.id === id)?.name;

  return (
    <Screen childBar={false} refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }}>
      {error ? <ErrorBox message={error} onRetry={load} /> : !data ? <Loading /> : data.notifications.length === 0 ? (
        <Card><Muted>No notifications yet. You'll be told here when results are published, about absences, and about school notices.</Muted></Card>
      ) : data.notifications.map((n) => (
        <Pressable key={n.id} onPress={() => open(n)} accessibilityRole="button">
          <Card style={!n.read && { borderColor: C.navy, borderWidth: 2 }}>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Text style={{ fontSize: 22 }}>{ICON[n.type] || '🔔'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '800', color: C.ink }}>{n.title}</Text>
                <Text style={{ color: C.ink, marginTop: 3, lineHeight: 20 }}>{n.body}</Text>
                <Muted style={{ marginTop: 4 }}>{when(n.date)}{n.studentId && session?.children?.length > 1 && childName(n.studentId) ? ` · ${childName(n.studentId)}` : ''}</Muted>
              </View>
            </View>
          </Card>
        </Pressable>
      ))}
    </Screen>
  );
}

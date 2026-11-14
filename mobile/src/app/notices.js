// School notices sent to the whole school, the child's class, or the child.
import { Text } from 'react-native';
import { useLoad } from '../lib/useLoad';
import { C } from '../lib/theme';
import { Screen, Card, Muted, Loading, ErrorBox } from '../components/ui';

const when = (d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

export default function Notices() {
  const { data, error, refreshing, refresh } = useLoad('/notices');
  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      {error ? <ErrorBox message={error} onRetry={refresh} /> : !data ? <Loading /> : data.notices.length === 0 ? (
        <Card><Muted>No notices yet.</Muted></Card>
      ) : data.notices.map((n) => (
        <Card key={n.id}>
          <Muted>{when(n.date)}</Muted>
          <Text style={{ fontSize: 16, fontWeight: '800', color: C.ink, marginTop: 4 }}>{n.title}</Text>
          <Text style={{ color: C.ink, marginTop: 6, lineHeight: 21 }}>{n.body}</Text>
        </Card>
      ))}
    </Screen>
  );
}

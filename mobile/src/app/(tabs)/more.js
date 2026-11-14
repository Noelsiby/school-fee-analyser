// More: timetable, notices, profile, switch child, sign out.
import { View, Text, Pressable, Alert, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useSession } from '../../lib/session';
import { C } from '../../lib/theme';
import { Screen, Card, Muted } from '../../components/ui';

function Item({ icon, label, onPress }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: 12 }, pressed && { opacity: 0.6 }]}>
      <Text style={{ fontSize: 20 }}>{icon}</Text>
      <Text style={{ flex: 1, fontSize: 16, color: C.ink }}>{label}</Text>
      <Text style={{ fontSize: 20, color: C.faint }}>›</Text>
    </Pressable>
  );
}

export default function More() {
  const router = useRouter();
  const { session, signOut } = useSession();
  const confirmSignOut = () => {
    if (Platform.OS === 'web') { if (window.confirm('Sign out of the app?')) signOut(); return; }
    Alert.alert('Sign out?', 'You will need your mobile number and PIN to sign in again.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: signOut },
    ]);
  };
  return (
    <Screen>
      <Card style={{ paddingVertical: 4 }}>
        <Item icon="🗓️" label="Timetable" onPress={() => router.push('/timetable')} />
        <Item icon="📢" label="School notices" onPress={() => router.push('/notices')} />
        <Item icon="👤" label="Profile" onPress={() => router.push('/profile')} />
        {(session?.children?.length || 0) > 1 && <Item icon="⇄" label="Switch child" onPress={() => router.push('/choose-child')} />}
      </Card>
      <Card style={{ paddingVertical: 4 }}>
        <Item icon="🚪" label="Sign out" onPress={confirmSignOut} />
      </Card>
      <View style={{ alignItems: 'center', marginTop: 8 }}>
        <Muted>Signed in as {session?.phone}</Muted>
        <Muted style={{ marginTop: 4 }}>Matha English Medium School · Kaikalur</Muted>
      </View>
    </Screen>
  );
}

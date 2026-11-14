// Root of the app: keeps the parent's login, and shows the sign-in screen until they
// are signed in, then the child chooser (brothers and sisters), then the app.
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator } from 'react-native';
import { SessionProvider, useSession } from '../lib/session';
import { C } from '../lib/theme';

function Root() {
  const { ready, session, child } = useSession();
  if (!ready) {
    return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' }}><ActivityIndicator size="large" color={C.navy} /></View>;
  }
  const signedIn = !!session;
  const header = { headerStyle: { backgroundColor: C.navy }, headerTintColor: '#fff', headerTitleStyle: { fontWeight: '700' } };
  return (
    <Stack screenOptions={header}>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="login" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={signedIn}>
        <Stack.Protected guard={!!child}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="timetable" options={{ title: 'Timetable' }} />
          <Stack.Screen name="notices" options={{ title: 'School notices' }} />
          <Stack.Screen name="profile" options={{ title: 'Profile' }} />
        </Stack.Protected>
        <Stack.Screen name="choose-child" options={{ title: 'Choose child', headerBackVisible: !!child }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function Layout() {
  return (
    <SessionProvider>
      <StatusBar style="light" />
      <Root />
    </SessionProvider>
  );
}

// Root of the app: keeps the parent's login, and shows the sign-in screen until they
// are signed in, then the child chooser (brothers and sisters), then the app.
import { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator } from 'react-native';
import { SessionProvider, useSession } from '../lib/session';
import { Notifications, notificationsSupported } from '../lib/notifications';
import { C } from '../lib/theme';

// Tapping a notification opens the screen it is about, for the right child.
function NotificationTaps() {
  const router = useRouter();
  const { session, chooseChild } = useSession();
  const last = notificationsSupported ? Notifications.useLastNotificationResponse() : null;
  useEffect(() => {
    const data = last?.notification?.request?.content?.data;
    if (!data || !session) return;
    (async () => {
      if (data.studentId && session.children?.some((c) => c.id === data.studentId) && data.studentId !== session.childId) {
        await chooseChild(data.studentId);
      }
      const screen = { results: '/results', attendance: '/attendance', notices: '/notices' }[data.screen] || '/notifications';
      setTimeout(() => router.push(screen), 300);
      Notifications.clearLastNotificationResponseAsync?.().catch(() => {});
    })();
  }, [last]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

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
          <Stack.Screen name="notifications" options={{ title: 'Notifications' }} />
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
      <NotificationTaps />
    </SessionProvider>
  );
}

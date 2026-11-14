// The five tabs at the bottom of the app.
import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { C } from '../../lib/theme';

const icon = (emoji) => ({ focused }) => <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.55 }}>{emoji}</Text>;

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: C.navy,
        tabBarInactiveTintColor: C.muted,
        headerStyle: { backgroundColor: C.navy },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '700' },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home', headerTitle: 'Matha School', tabBarIcon: icon('🏠') }} />
      <Tabs.Screen name="results" options={{ title: 'Results', tabBarIcon: icon('📊') }} />
      <Tabs.Screen name="progress" options={{ title: 'Progress', tabBarIcon: icon('📈') }} />
      <Tabs.Screen name="attendance" options={{ title: 'Attendance', tabBarIcon: icon('✅') }} />
      <Tabs.Screen name="more" options={{ title: 'More', tabBarIcon: icon('☰') }} />
    </Tabs>
  );
}

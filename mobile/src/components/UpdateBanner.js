// "New version available" — the app isn't on the Play Store, so when the school sets a newer
// latest version (Admin → Student App), older apps show this and open the download page.
// (Small fixes reach phones by themselves through Expo updates; this is for new app files.)
import { useEffect, useState } from 'react';
import { Text, Pressable, Linking, Platform } from 'react-native';
import * as Application from 'expo-application';
import { api, API_URL } from '../lib/api';
import { C } from '../lib/theme';
import { Card } from './ui';

const parts = (v) => String(v || '').split('.').map((n) => parseInt(n, 10) || 0);
export function isNewer(latest, current) {
  const a = parts(latest), b = parts(current);
  for (let i = 0; i < 3; i++) if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
  return false;
}

export default function UpdateBanner() {
  const [latest, setLatest] = useState(null);
  const current = Application.nativeApplicationVersion;

  useEffect(() => {
    if (Platform.OS === 'web' || !current) return;
    api('/version').then((d) => { if (d.latestVersion && isNewer(d.latestVersion, current)) setLatest(d.latestVersion); }).catch(() => {});
  }, [current]);

  if (!latest) return null;
  return (
    <Pressable onPress={() => Linking.openURL(`${API_URL}/app`)} accessibilityRole="button">
      <Card style={{ backgroundColor: C.amberBg, borderColor: '#f59e0b', paddingVertical: 12 }}>
        <Text style={{ color: '#92400e', fontWeight: '800' }}>⬆ New version {latest} available</Text>
        <Text style={{ color: '#92400e', marginTop: 3 }}>Tap to download it. You'll stay signed in.</Text>
      </Card>
    </Pressable>
  );
}

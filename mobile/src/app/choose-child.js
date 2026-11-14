// Parents with more than one child at the school pick whose details to see.
import { useEffect, useState } from 'react';
import { View, Text, Pressable, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { useSession } from '../lib/session';
import { photoSource } from '../lib/api';
import { C } from '../lib/theme';
import { Screen, Muted, s } from '../components/ui';

export default function ChooseChild() {
  const { session, chooseChild, child } = useSession();
  const router = useRouter();
  const [picked, setPicked] = useState(null);
  // Go to the app once the chosen child is active (the app's screens unlock then)
  useEffect(() => {
    if (picked && child?.id === picked) router.replace('/');
  }, [picked, child, router]);
  const pick = async (id) => {
    setPicked(id);
    await chooseChild(id);
  };
  return (
    <Screen childBar={false}>
      <Muted>Your children at Matha English Medium School. You can switch any time from the top of each screen.</Muted>
      {(session?.children || []).map((c) => (
        <Pressable key={c.id} onPress={() => pick(c.id)} accessibilityRole="button"
          style={({ pressed }) => [s.childBar, c.id === session.childId && { borderColor: C.navy, borderWidth: 2 }, pressed && { opacity: 0.8 }]}>
          {c.hasPhoto
            ? <Image source={photoSource(c.id)} style={s.avatar} />
            : <View style={[s.avatar, s.avatarEmpty]}><Text style={s.avatarText}>{c.name.slice(0, 1)}</Text></View>}
          <View style={{ flex: 1 }}>
            <Text style={s.childName}>{c.name}</Text>
            <Text style={s.childMeta}>{c.className} · Roll {c.rollNumber}</Text>
          </View>
          <Text style={{ color: C.navy, fontSize: 22 }}>›</Text>
        </Pressable>
      ))}
    </Screen>
  );
}

// Small building blocks used by every screen.
import { View, Text, ScrollView, RefreshControl, ActivityIndicator, Pressable, StyleSheet, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { C, gradeColors } from '../lib/theme';
import { useSession } from '../lib/session';
import { photoSource } from '../lib/api';

/** A scrolling page with pull-to-refresh and the child bar on top. */
export function Screen({ children, refreshing = false, onRefresh, childBar = true }) {
  return (
    <ScrollView
      style={s.screen}
      contentContainerStyle={s.content}
      refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[C.navy]} /> : undefined}
    >
      {childBar && <ChildBar />}
      {children}
    </ScrollView>
  );
}

/** Which child is shown, with "Switch" when the parent has more than one. */
export function ChildBar() {
  const { child, session } = useSession();
  const router = useRouter();
  if (!child) return null;
  const many = (session?.children?.length || 0) > 1;
  return (
    <View style={s.childBar}>
      {child.hasPhoto
        ? <Image source={photoSource(child.id)} style={s.avatar} />
        : <View style={[s.avatar, s.avatarEmpty]}><Text style={s.avatarText}>{child.name.slice(0, 1)}</Text></View>}
      <View style={{ flex: 1 }}>
        <Text style={s.childName} numberOfLines={1}>{child.name}</Text>
        <Text style={s.childMeta}>{child.className} · Roll {child.rollNumber}</Text>
      </View>
      {many && (
        <Pressable onPress={() => router.push('/choose-child')} style={s.switchBtn} accessibilityRole="button" accessibilityLabel="Switch child">
          <Text style={s.switchText}>Switch ⇄</Text>
        </Pressable>
      )}
    </View>
  );
}

export const Card = ({ children, style }) => <View style={[s.card, style]}>{children}</View>;
export const Title = ({ children, style }) => <Text style={[s.title, style]}>{children}</Text>;
export const Muted = ({ children, style }) => <Text style={[s.muted, style]}>{children}</Text>;

export function GradeBadge({ grade }) {
  const g = gradeColors(grade);
  return <Text style={[s.badge, { color: g.fg, backgroundColor: g.bg }]}>{grade || '—'}</Text>;
}

export function Badge({ text, fg = C.muted, bg = C.line }) {
  return <Text style={[s.badge, { color: fg, backgroundColor: bg }]}>{text}</Text>;
}

export function Loading() {
  return <View style={s.center}><ActivityIndicator size="large" color={C.navy} /></View>;
}

export function ErrorBox({ message, onRetry }) {
  return (
    <Card style={{ borderColor: C.redBg }}>
      <Text style={{ color: C.red, marginBottom: onRetry ? 10 : 0 }}>⚠ {message}</Text>
      {onRetry && <Button title="Try again" onPress={onRetry} variant="ghost" />}
    </Card>
  );
}

export function Button({ title, onPress, disabled, variant = 'primary', style }) {
  const ghost = variant === 'ghost';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [s.btn, ghost && s.btnGhost, (disabled || pressed) && { opacity: disabled ? 0.5 : 0.8 }, style]}
    >
      <Text style={[s.btnText, ghost && { color: C.navy }]}>{title}</Text>
    </Pressable>
  );
}

/** "label …… value" line. */
export function Row({ label, value, strong }) {
  return (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={[s.rowValue, strong && { fontWeight: '700' }]}>{value ?? '—'}</Text>
    </View>
  );
}

export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, paddingBottom: 32, gap: 12 },
  center: { paddingVertical: 48, alignItems: 'center' },
  childBar: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: C.line },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  avatarEmpty: { backgroundColor: C.navy, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: 18 },
  childName: { fontSize: 16, fontWeight: '700', color: C.ink },
  childMeta: { fontSize: 13, color: C.muted, marginTop: 2 },
  switchBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: C.navyLight },
  switchText: { color: C.navy, fontWeight: '700', fontSize: 13 },
  card: { backgroundColor: C.card, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: C.line },
  title: { fontSize: 16, fontWeight: '700', color: C.ink, marginBottom: 8 },
  muted: { fontSize: 13, color: C.muted },
  badge: { alignSelf: 'flex-start', fontSize: 12, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, overflow: 'hidden' },
  btn: { backgroundColor: C.navy, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  btnGhost: { backgroundColor: C.navyLight },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', gap: 12 },
  rowLabel: { color: C.muted, fontSize: 14, flexShrink: 0 },
  rowValue: { color: C.ink, fontSize: 14, flex: 1, textAlign: 'right' },
});

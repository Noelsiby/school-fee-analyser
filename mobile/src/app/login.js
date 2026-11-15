// Sign in with mobile number + PIN, or (first time) mobile number + activation code + new PIN.
import { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../lib/api';
import { getItem, setItem } from '../lib/storage';
import { useSession } from '../lib/session';
import { C } from '../lib/theme';
import { Button } from '../components/ui';

const logo = require('../../assets/icon.png');
const USED_KEY = 'signedInBefore'; // set after the first successful activation/sign-in on this phone

export default function Login() {
  const { signIn } = useSession();
  const [mode, setMode] = useState('login'); // login | activate
  // A phone that has never signed in starts on "First time" (code), not the PIN screen
  useEffect(() => { getItem(USED_KEY).then((v) => { if (!v) setMode('activate'); }).catch(() => {}); }, []);
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [code, setCode] = useState('');
  const [pin2, setPin2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const digits = (v) => v.replace(/\D/g, '');
  const activate = mode === 'activate';

  const submit = async () => {
    setError('');
    if (digits(phone).length < 10) return setError('Enter the 10-digit mobile number the school has.');
    if (activate && digits(code).length !== 6) return setError('Enter the 6-digit activation code from the school.');
    if (pin.length !== 4) return setError(activate ? 'Choose a 4-digit PIN.' : 'Enter your 4-digit PIN.');
    if (activate && pin !== pin2) return setError("The two PINs don't match.");
    setBusy(true);
    try {
      const d = await api(activate ? '/activate' : '/login', { method: 'POST', body: activate ? { phone, code, pin } : { phone, pin } });
      await setItem(USED_KEY, '1').catch(() => {});
      await signIn(d);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={st.wrap} keyboardShouldPersistTaps="handled">
          <Image source={logo} style={st.logo} />
          <Text style={st.school}>Matha English Medium School</Text>
          <Text style={st.sub}>{activate ? 'First time: activate the app' : 'Parent sign in'}</Text>

          <View style={st.tabs} accessibilityRole="tablist">
            {[['activate', 'First time (code)'], ['login', 'Sign in (PIN)']].map(([m, label]) => (
              <Pressable key={m} onPress={() => { setMode(m); setError(''); }} style={[st.tab, mode === m && st.tabOn]}
                accessibilityRole="tab" accessibilityState={{ selected: mode === m }}>
                <Text style={[st.tabText, mode === m && st.tabTextOn]}>{label}</Text>
              </Pressable>
            ))}
          </View>

          <View style={st.form}>
            <Text style={st.label}>Parent mobile number</Text>
            <TextInput style={st.input} value={phone} onChangeText={(v) => setPhone(digits(v).slice(0, 12))} keyboardType="phone-pad"
              placeholder="10-digit number" placeholderTextColor={C.faint} autoComplete="tel" accessibilityLabel="Parent mobile number" />

            {activate && (
              <>
                <Text style={st.label}>Activation code (from the school slip or WhatsApp)</Text>
                <TextInput style={[st.input, st.code]} value={code} onChangeText={(v) => setCode(digits(v).slice(0, 6))} keyboardType="number-pad"
                  placeholder="6 digits" placeholderTextColor={C.faint} accessibilityLabel="Activation code" />
              </>
            )}

            <Text style={st.label}>{activate ? 'Choose a 4-digit PIN' : 'PIN'}</Text>
            <TextInput style={[st.input, st.code]} value={pin} onChangeText={(v) => setPin(digits(v).slice(0, 4))} keyboardType="number-pad"
              secureTextEntry placeholder="••••" placeholderTextColor={C.faint} accessibilityLabel="PIN" />

            {activate && (
              <>
                <Text style={st.label}>Type the PIN again</Text>
                <TextInput style={[st.input, st.code]} value={pin2} onChangeText={(v) => setPin2(digits(v).slice(0, 4))} keyboardType="number-pad"
                  secureTextEntry placeholder="••••" placeholderTextColor={C.faint} accessibilityLabel="Repeat PIN" />
              </>
            )}

            {!!error && <Text style={st.error}>⚠ {error}</Text>}
            <Button title={busy ? 'Please wait…' : activate ? 'Activate' : 'Sign in'} onPress={submit} disabled={busy} style={{ marginTop: 8 }} />

            <Pressable onPress={() => { setMode(activate ? 'login' : 'activate'); setError(''); }} style={st.switch} accessibilityRole="button">
              <Text style={st.switchText}>{activate ? 'Already activated? Sign in with your PIN' : 'First time? Use the 6-digit code'}</Text>
            </Pressable>
            <Text style={st.help}>Forgot your PIN or lost the code? Please contact the school office.</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  wrap: { padding: 24, alignItems: 'center' },
  logo: { width: 96, height: 96, marginTop: 12 },
  school: { fontSize: 20, fontWeight: '800', color: C.navy, textAlign: 'center', marginTop: 10 },
  sub: { fontSize: 15, color: C.muted, marginTop: 4, marginBottom: 20 },
  form: { width: '100%', maxWidth: 420 },
  tabs: { flexDirection: 'row', width: '100%', maxWidth: 420, backgroundColor: C.line, borderRadius: 12, padding: 4, marginBottom: 4 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 9 },
  tabOn: { backgroundColor: C.navy },
  tabText: { fontWeight: '700', color: C.muted, fontSize: 14 },
  tabTextOn: { color: '#fff' },
  label: { fontSize: 13, color: C.muted, marginBottom: 6, marginTop: 12 },
  input: { borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 17, color: C.ink, backgroundColor: '#fff' },
  code: { letterSpacing: 6, fontWeight: '700' },
  error: { color: C.red, marginTop: 12 },
  switch: { alignItems: 'center', paddingVertical: 16 },
  switchText: { color: C.navy, fontWeight: '700', fontSize: 15 },
  help: { color: C.faint, fontSize: 12, textAlign: 'center' },
});

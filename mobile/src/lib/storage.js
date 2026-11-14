// Where the login is kept: the phone's secure storage (Android/iOS), or the
// browser's localStorage when previewing the app on the web.
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const web = Platform.OS === 'web';

export async function getItem(key) {
  if (web) { try { return localStorage.getItem(key); } catch { return null; } }
  return SecureStore.getItemAsync(key);
}

export async function setItem(key, value) {
  if (web) { try { localStorage.setItem(key, value); } catch { /* private window */ } return; }
  await SecureStore.setItemAsync(key, value);
}

export async function removeItem(key) {
  if (web) { try { localStorage.removeItem(key); } catch { /* ignore */ } return; }
  await SecureStore.deleteItemAsync(key);
}

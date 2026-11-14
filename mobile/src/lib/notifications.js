// Push notifications: ask permission, get this phone's Expo push token, and decide
// how notifications look while the app is open. Not available in the web preview.
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';

const supported = Platform.OS !== 'web';

if (supported) {
  // Show notifications even while the app is open
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

/**
 * Returns this phone's Expo push token, or null when notifications can't be used
 * (web preview, emulator without Google services, permission refused, or the app
 * isn't linked to an Expo project yet).
 */
export async function registerForPush() {
  if (!supported || !Device.isDevice) return null;
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'School updates',
        importance: Notifications.AndroidImportance.HIGH,
      });
    }
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') ({ status } = await Notifications.requestPermissionsAsync());
    if (status !== 'granted') return null;
    const projectId = Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;
    if (!projectId) return null;
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    return data;
  } catch (e) {
    console.warn('Notifications not available:', e?.message);
    return null;
  }
}

export { Notifications, supported as notificationsSupported };

import { PermissionsAndroid, Platform } from 'react-native';

export type PermissionResult = 'granted' | 'denied' | 'blocked';

function map(result: string): PermissionResult {
  if (result === PermissionsAndroid.RESULTS.GRANTED) return 'granted';
  if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) return 'blocked';
  return 'denied';
}

const apiLevel = typeof Platform.Version === 'number' ? Platform.Version : 0;

/** Fiziksel aktivite (hareket) izni: Android 10+ çalışma zamanı izni. Adım sensörü ve Recording API için gerekli. */
export async function requestActivityRecognition(): Promise<PermissionResult> {
  if (apiLevel < 29) return 'granted';
  return map(await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACTIVITY_RECOGNITION));
}

/**
 * Bildirim izni: Android 13+ çalışma zamanı izni, daha eskilerde gerekmez.
 * Yalnızca kullanıcı canlı bildirimi seçtiğinde istenir.
 */
export async function requestNotifications(): Promise<PermissionResult> {
  if (apiLevel < 33) return 'granted';
  return map(await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS));
}

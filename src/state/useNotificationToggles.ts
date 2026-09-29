import { Alert } from 'react-native';

import StepTracker from '../../modules/step-tracker';
import { requestNotifications } from '../lib/permissions';
import { useTracker } from './TrackerContext';

/**
 * "Bildirimde göster" ve "Kilit ekranında göster" anahtarları.
 * Kilit ekranındaki sayı bu bildirimin kendisidir; bu yüzden ikinci anahtar birinciye bağlıdır.
 */
export function useNotificationToggles() {
  const { state, run } = useTracker();

  const setNotification = async (enabled: boolean): Promise<boolean> => {
    if (!enabled) {
      await run(() => StepTracker.setNotificationEnabled(false));
      return true;
    }
    // Bildirim izni yalnızca kullanıcı bu özelliği seçtiğinde istenir (Android 13+).
    const result = await requestNotifications();
    if (result !== 'granted') {
      Alert.alert(
        'Bildirim izni verilmedi',
        'Canlı sayaç bir Android bildirimi olarak gösterildiği için bildirim izni gerekiyor. Adımlar yine de sayılmaya devam eder; yalnızca bildirim alanında görünmez.',
        result === 'blocked'
          ? [
              { text: 'Vazgeç', style: 'cancel' },
              { text: 'Ayarları aç', onPress: () => StepTracker.openNotificationSettings() },
            ]
          : [{ text: 'Tamam' }],
      );
      await run(() => StepTracker.getState());
      return false;
    }
    await run(() => StepTracker.setNotificationEnabled(true));
    return true;
  };

  const setLockScreen = async (enabled: boolean) => {
    await run(() => StepTracker.setLockScreenEnabled(enabled));
  };

  return { state, setNotification, setLockScreen };
}

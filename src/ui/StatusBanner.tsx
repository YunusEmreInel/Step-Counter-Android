import { Linking } from 'react-native';

import StepTracker, { type TrackerState } from '../../modules/step-tracker';
import { requestActivityRecognition } from '../lib/permissions';
import { useTracker } from '../state/TrackerContext';
import { Button, Notice, Pill } from './components';
import { useColors } from './theme';

/** Başlıktaki küçük durum etiketi: Sayılıyor · Bildirim gizli · Durduruldu · İzin gerekli */
export function StatusPill({ state }: { state: TrackerState }) {
  const c = useColors();
  const { run } = useTracker();
  switch (state.status) {
    case 'permission_required':
      return <Pill label="İzin gerekli" color={c.danger} background={c.dangerSoft} icon="lock-outline" />;
    case 'unsupported':
      return <Pill label="Desteklenmiyor" color={c.danger} background={c.dangerSoft} icon="alert-circle-outline" />;
    case 'stopped':
      return <Pill label="Durduruldu" color={c.paused} background={c.pausedSoft} icon="pause" />;
    default:
      if (state.hiddenByAction) {
        return (
          <Pill
            label="Bildirim gizli"
            color={c.textMuted}
            background={c.surfaceAlt}
            icon="bell-off-outline"
            onPress={() => run(() => StepTracker.setNotificationEnabled(true))}
          />
        );
      }
      return <Pill label="Sayılıyor" color={c.accent} background={c.accentSoft} />;
  }
}

/** Sayım sürerken dikkat edilmesi gereken kısıtlar. Sorun yoksa hiçbir şey göstermez. */
export function StatusNotices({ state }: { state: TrackerState }) {
  if (state.status !== 'counting') return null;
  if (state.notificationEnabled && !state.notificationPermission) {
    return (
      <Notice tone="warning" icon="bell-alert-outline" title="Bildirim izni kapalı" text="Canlı sayaç bildirim alanında gösterilemiyor.">
        <Button kind="tonal" label="Bildirim ayarları" onPress={() => StepTracker.openNotificationSettings()} />
      </Notice>
    );
  }
  if (state.recording === 'update_required') {
    return (
      <Notice
        tone="warning"
        icon="update"
        title="Google Play hizmetleri güncel değil"
        text="Uygulama kapalıyken sayım için güncelleme gerekiyor."
      >
        <Button kind="tonal" label="Güncelle" onPress={() => Linking.openURL('market://details?id=com.google.android.gms')} />
      </Notice>
    );
  }
  if (state.recording === 'unavailable') {
    return (
      <Notice
        tone="info"
        icon="information-outline"
        title="Arka plan kaydı yok"
        text="Google Play hizmetleri olmadan adımlar yalnızca uygulama veya canlı bildirim açıkken sayılır."
      />
    );
  }
  if (!state.hasLiveSensor) {
    return (
      <Notice tone="info" icon="information-outline" title="Canlı sensör yok" text="Sayı, arka plan kaydından birkaç dakika gecikmeyle güncellenir." />
    );
  }
  return null;
}

export function useAskMotionPermission() {
  const { run } = useTracker();
  return async () => {
    const result = await requestActivityRecognition();
    if (result === 'blocked') StepTracker.openAppSettings();
    await run(() => StepTracker.getState());
  };
}

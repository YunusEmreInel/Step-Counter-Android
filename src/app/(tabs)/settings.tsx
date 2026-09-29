import { useState } from 'react';
import { ActivityIndicator, Alert } from 'react-native';

import StepTracker from '../../../modules/step-tracker';
import { useHealth } from '../../state/HealthContext';
import { useNotificationToggles } from '../../state/useNotificationToggles';
import { useTracker } from '../../state/TrackerContext';
import { Body, Card, Footnote, Group, Row, Screen, SectionLabel, SwitchRow } from '../../ui/components';
import { useAskMotionPermission } from '../../ui/StatusBanner';
import { useColors } from '../../ui/theme';

export default function SettingsScreen() {
  const c = useColors();
  const { state, run } = useTracker();
  const { reload } = useHealth();
  const { setNotification, setLockScreen } = useNotificationToggles();
  const askMotion = useAskMotionPermission();
  const [syncing, setSyncing] = useState(false);
  const [showHow, setShowHow] = useState(false);
  if (!state) return null;

  const confirmDelete = (title: string, message: string, action: () => Promise<void>) =>
    Alert.alert(title, message, [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Sil', style: 'destructive', onPress: () => void action() },
    ]);

  const lastSync = state.lastSyncMillis
    ? new Date(state.lastSyncMillis).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
    : '—';

  return (
    <Screen title="Ayarlar">
      <SectionLabel>Kayıt</SectionLabel>
      <Group>
        {state.trackingEnabled ? (
          <Row
            icon="pause-circle-outline"
            iconColor={c.paused}
            title="Kaydı durdur"
            subtitle="Sensör, bildirim ve arka plan kaydı kapanır."
            onPress={() => run(() => StepTracker.stop())}
          />
        ) : (
          <Row icon="play-circle-outline" title="Kayda devam et" subtitle="Şu an duraklatılmış." onPress={() => run(() => StepTracker.start())} />
        )}
        <Row
          icon="sync"
          title="Şimdi eşitle"
          value={lastSync}
          right={syncing ? <ActivityIndicator color={c.accent} /> : undefined}
          onPress={async () => {
            setSyncing(true);
            await run(() => StepTracker.syncNow());
            setSyncing(false);
          }}
        />
      </Group>

      <SectionLabel>Bildirim</SectionLabel>
      <Group>
        <SwitchRow
          icon="bell-ring-outline"
          title="Bildirimde göster"
          subtitle={state.hiddenByAction ? 'Bildirimden gizlendi' : 'Bugünkü adımlar bildirim alanında'}
          value={state.notificationEnabled}
          onChange={setNotification}
        />
        <SwitchRow
          icon="cellphone-lock"
          title="Kilit ekranında göster"
          subtitle={state.notificationEnabled ? 'Yalnızca adım sayısı görünür' : 'Önce bildirimi açın'}
          value={state.notificationEnabled && state.lockScreenEnabled}
          disabled={!state.notificationEnabled}
          onChange={setLockScreen}
        />
        <Row icon="tune-variant" title="Android bildirim ayarları" onPress={() => StepTracker.openNotificationSettings()} />
      </Group>
      <Footnote>
        Kilit ekranı, canlı bildirimin kendisidir. Android'in kilit ekranı gizlilik ayarları bu tercihi geçersiz kılabilir.
      </Footnote>

      <SectionLabel>İzinler</SectionLabel>
      <Group>
        <Row
          icon="walk"
          iconColor={state.activityPermission ? c.accent : c.danger}
          title="Fiziksel aktivite"
          value={state.activityPermission ? 'Verildi' : 'Verilmedi'}
          onPress={state.activityPermission ? () => StepTracker.openAppSettings() : askMotion}
        />
        <Row
          icon="bell-outline"
          iconColor={state.notificationPermission ? c.accent : c.textMuted}
          title="Bildirimler"
          value={state.notificationPermission ? 'Açık' : 'Kapalı'}
          onPress={() => StepTracker.openNotificationSettings()}
        />
      </Group>
      <Footnote>Konum, internet veya hesap izni istenmez. Tüm veriler bu telefonda kalır.</Footnote>

      <SectionLabel>Veriler</SectionLabel>
      <Group>
        <Row
          icon="delete-clock-outline"
          destructive
          title="Adım geçmişini sil"
          onPress={() =>
            confirmDelete('Adım geçmişi silinsin mi?', 'Bugün dahil tüm adım kayıtları silinir. Kilo ve kalori kayıtları korunur.', async () => {
              await run(() => StepTracker.deleteStepHistory());
            })
          }
        />
        <Row
          icon="delete-forever-outline"
          destructive
          title="Tüm verileri sil"
          onPress={() =>
            confirmDelete('Tüm veriler silinsin mi?', 'Adımlar, kilo ölçümleri, kalori kayıtları ve profil kalıcı olarak silinir.', async () => {
              await run(() => StepTracker.deleteAllData());
              await reload();
            })
          }
        />
      </Group>

      <SectionLabel>Hakkında</SectionLabel>
      <Group>
        <Row
          icon="information-outline"
          title="Nasıl çalışır?"
          right={null}
          onPress={() => setShowHow((v) => !v)}
        />
      </Group>
      {showHow ? (
        <Card>
          <Body small muted>
            Uygulama açıkken telefonun donanım adım sayacı dinlenir. Kapalıyken adımları Android'in düşük güç tüketen kaydı
            (Google Play hizmetleri Recording API) tutar; uygulama açıldığında ve birkaç saatte bir bu kayıt uygulamanın
            veritabanına aktarılır. İki kaynak aynı adımları bildirdiği için toplanmaz, büyük olan kullanılır.
          </Body>
          <Body small muted>
            Mesafe boyunuzdan (boy × 0,414) veya kalibre ettiğiniz adım uzunluğundan, yürüyüş enerjisi 0,5 kcal/kg/km ile
            tahmin edilir. Bu değerler ölçüm değildir.
          </Body>
        </Card>
      ) : null}
    </Screen>
  );
}

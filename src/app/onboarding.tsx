import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import StepTracker from '../../modules/step-tracker';
import { requestActivityRecognition, type PermissionResult } from '../lib/permissions';
import { useNotificationToggles } from '../state/useNotificationToggles';
import { useTracker } from '../state/TrackerContext';
import { Button, Group, Icon, Notice, SwitchRow, type IconName } from '../ui/components';
import { useColors } from '../ui/theme';

export default function OnboardingScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { state, run } = useTracker();
  const { setNotification, setLockScreen } = useNotificationToggles();
  const [step, setStep] = useState(0);
  const [motion, setMotion] = useState<PermissionResult | null>(null);
  const [busy, setBusy] = useState(false);

  const askMotion = async () => {
    const result = await requestActivityRecognition();
    setMotion(result);
    await run(() => StepTracker.getState());
    if (result === 'granted') setStep(2);
  };

  const finish = async () => {
    setBusy(true);
    await run(() => StepTracker.completeOnboarding());
    await run(() => StepTracker.start());
    setBusy(false);
    router.replace('/');
  };

  const Hero = ({ icon, title, text }: { icon: IconName; title: string; text: string }) => (
    <View style={{ alignItems: 'center', gap: 14, marginTop: 40, marginBottom: 12 }}>
      <View style={{ width: 88, height: 88, borderRadius: 28, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={44} color={c.accent} />
      </View>
      <Text style={{ color: c.text, fontSize: 28, fontWeight: '800', textAlign: 'center', letterSpacing: -0.5 }}>{title}</Text>
      <Text style={{ color: c.textMuted, fontSize: 16, lineHeight: 23, textAlign: 'center', maxWidth: 320 }}>{text}</Text>
    </View>
  );

  const Point = ({ icon, text }: { icon: IconName; text: string }) => (
    <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
      <Icon name={icon} size={22} color={c.accent} />
      <Text style={{ color: c.text, fontSize: 15, flex: 1, lineHeight: 21 }}>{text}</Text>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.background, paddingTop: insets.top, paddingBottom: insets.bottom + 16, paddingHorizontal: 20 }}>
      <View style={{ flex: 1, gap: 20 }}>
        {step === 0 ? (
          <>
            <Hero icon="shoe-print" title="Adım Sayar" text="Günlük adımlarınız, takviminiz ve kilo takibiniz tek yerde." />
            <View style={{ gap: 18, paddingHorizontal: 8 }}>
              <Point icon="shield-check-outline" text="Hesap, reklam ve sunucu yok. Veriler bu telefonda kalır." />
              <Point icon="battery-charging-outline" text="Uygulama kapalıyken Android'in düşük güç tüketen kaydı çalışır." />
              <Point icon="calculator-variant-outline" text="Mesafe ve kalori tahmindir; nasıl hesaplandığı açıkça gösterilir." />
            </View>
          </>
        ) : null}

        {step === 1 ? (
          <>
            <Hero icon="walk" title="Hareket izni" text="Adımları saymak için Fiziksel aktivite iznine ihtiyaç var. Konumunuz kullanılmaz." />
            {motion === 'denied' || motion === 'blocked' ? (
              <Notice tone="warning" icon="alert-outline" title="İzin verilmedi" text="Takvim ve kilo bölümleri yine çalışır. İzni daha sonra Ayarlar'dan verebilirsiniz.">
                {motion === 'blocked' ? <Button kind="tonal" label="Android ayarlarını aç" onPress={() => StepTracker.openAppSettings()} /> : null}
              </Notice>
            ) : null}
          </>
        ) : null}

        {step === 2 && state ? (
          <>
            <Hero icon="bell-ring-outline" title="Bildirim" text="İsterseniz bugünkü adımlarınız bildirim alanında canlı görünür. İkisi de kapalı başlar." />
            <Group>
              <SwitchRow
                icon="bell-ring-outline"
                title="Bildirimde göster"
                subtitle="Durdur ve Gizle düğmeleriyle"
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
            </Group>
            <Text style={{ color: c.textFaint, fontSize: 13, textAlign: 'center' }}>
              Canlı bildirim, telefon cebinizdeyken de sensörü dinlediği için biraz daha fazla pil kullanır.
            </Text>
          </>
        ) : null}
      </View>

      <View style={{ gap: 10 }}>
        {step === 0 ? <Button label="Başla" onPress={() => setStep(state?.activityPermission ? 2 : 1)} /> : null}
        {step === 1 ? (
          <>
            <Button label="İzin ver" onPress={askMotion} />
            {motion ? <Button kind="ghost" label="İzinsiz devam et" onPress={() => setStep(2)} /> : null}
          </>
        ) : null}
        {step === 2 ? <Button label="Bitti" busy={busy} onPress={finish} /> : null}
      </View>
    </View>
  );
}

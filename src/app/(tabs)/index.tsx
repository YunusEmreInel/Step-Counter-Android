import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import StepTracker, { type TrackerState } from '../../../modules/step-tracker';
import { addDays, formatLongDate, WEEKDAY_SHORT, weekdayMondayFirst } from '../../lib/dates';
import { fmtInt } from '../../lib/format';
import { useHealth } from '../../state/HealthContext';
import { dayMetrics } from '../../state/metrics';
import { useTracker } from '../../state/TrackerContext';
import { useGoalModel } from '../../state/useGoalModel';
import { DayBars, ProgressRing } from '../../ui/charts';
import { Button, Card, Icon, Screen, Stat, Title } from '../../ui/components';
import { StatusNotices, StatusPill, useAskMotionPermission } from '../../ui/StatusBanner';
import { useColors, type Colors } from '../../ui/theme';

export default function TodayScreen() {
  const { state } = useTracker();
  const { profile, weights } = useHealth();
  const [week, setWeek] = useState<Record<string, number>>({});
  const today = state?.date;

  useFocusEffect(
    useCallback(() => {
      if (!today) return;
      StepTracker.getDays(addDays(today, -6), today).then((rows) =>
        setWeek(Object.fromEntries(rows.map((r) => [r.date, r.steps]))),
      );
    }, [today]),
  );

  if (!state) return null;
  const m = dayMetrics(state.date, state.steps, profile, weights);

  const days = Array.from({ length: 7 }, (_, i) => {
    const key = addDays(state.date, i - 6);
    const isToday = key === state.date;
    return {
      key,
      label: WEEKDAY_SHORT[weekdayMondayFirst(key)],
      steps: isToday ? state.steps : week[key] ?? null,
      today: isToday,
    };
  });
  const recorded = days.filter((d) => d.steps != null);
  const weekAvg = recorded.length ? recorded.reduce((s, d) => s + (d.steps ?? 0), 0) / recorded.length : 0;

  return (
    <Screen title="Bugün" subtitle={formatLongDate(state.date)} right={<StatusPill state={state} />}>
      <Hero state={state} steps={m.steps} goal={m.goal} />

      <StatusNotices state={state} />

      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Stat
          icon="map-marker-distance"
          label="Mesafe"
          value={m.distanceKm == null ? '—' : `${m.distanceKm.toFixed(2).replace('.', ',')} km`}
          hint={m.stride == null ? 'Boyunu ekle' : 'Tahmini'}
          onPress={m.stride == null ? () => router.push('/weight') : undefined}
        />
        <Stat
          icon="fire"
          label="Yürüyüş"
          value={m.walkingKcal == null ? '—' : `${fmtInt(m.walkingKcal)} kcal`}
          hint={m.walkingKcal == null ? 'Kilonu ekle' : 'Tahmini'}
          onPress={m.walkingKcal == null ? () => router.push('/weight') : undefined}
        />
      </View>

      <LimitCard />

      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <Title>Son 7 gün</Title>
          <WeekAverage value={weekAvg} />
        </View>
        <DayBars days={days} goal={m.goal} />
      </Card>
    </Screen>
  );
}

/** Günlük kalori sınırı: adım attıkça canlı yükselir. Dokununca Hedef sekmesi açılır. */
function LimitCard() {
  const c = useColors();
  const model = useGoalModel();
  if (!model || model.limit.kind !== 'ok') return null;
  const { limit } = model;
  return (
    <Pressable accessibilityRole="button" onPress={() => router.push('/weight')}>
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="silverware-fork-knife" size={22} color={c.accent} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: c.textMuted, fontSize: 13, fontWeight: '600' }}>Bugünkü sınırın</Text>
          <Text style={{ color: c.text, fontSize: 22, fontWeight: '800', fontVariant: ['tabular-nums'] }}>
            {fmtInt(limit.limit)} <Text style={{ fontSize: 14, color: c.textMuted }}>kcal</Text>
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ color: c.accent, fontSize: 16, fontWeight: '800' }}>+{fmtInt(limit.walking)}</Text>
          <Text style={{ color: c.textFaint, fontSize: 12 }}>adımlarından</Text>
        </View>
      </Card>
    </Pressable>
  );
}

function WeekAverage({ value }: { value: number }) {
  const c = useColors();
  return (
    <Text style={{ color: c.textMuted, fontSize: 14 }}>
      ort. <Text style={{ color: c.text, fontWeight: '700' }}>{fmtInt(value)}</Text>
    </Text>
  );
}

function Hero({ state, steps, goal }: { state: TrackerState; steps: number; goal: number }) {
  const c = useColors();
  const { run } = useTracker();
  const askMotion = useAskMotionPermission();

  if (state.status === 'permission_required' || state.status === 'unsupported') {
    const permission = state.status === 'permission_required';
    return (
      <Card style={{ alignItems: 'center', paddingVertical: 32, gap: 14 }}>
        <IconBadge name={permission ? 'shield-lock-outline' : 'cellphone-off'} color={c.danger} bg={c.dangerSoft} />
        <Text style={{ color: c.text, fontSize: 20, fontWeight: '800', textAlign: 'center' }}>
          {permission ? 'Hareket izni gerekli' : 'Bu cihazda adım sayılamıyor'}
        </Text>
        <Text style={{ color: c.textMuted, fontSize: 15, lineHeight: 21, textAlign: 'center', maxWidth: 300 }}>
          {permission
            ? 'Adımları saymak için Fiziksel aktivite iznine ihtiyaç var. Konum kullanılmaz.'
            : 'Adım sensörü ve Google Play hizmetleri adım kaydı bulunamadı.'}
        </Text>
        {permission ? <Button label="İzin ver" icon="check" onPress={askMotion} /> : null}
      </Card>
    );
  }

  const paused = state.status === 'stopped';
  const ringColor = paused ? c.paused : c.accent;
  const reached = steps >= goal;

  return (
    <Card style={{ alignItems: 'center', paddingVertical: 24, gap: 14, backgroundColor: paused ? c.pausedSoft : c.surface }}>
      <ProgressRing size={220} stroke={14} progress={steps / goal} color={ringColor}>
        <View style={{ alignItems: 'center', opacity: paused ? 0.75 : 1 }}>
          {paused ? <Icon name="pause-circle" size={26} color={c.paused} /> : null}
          <Text
            accessibilityLabel={`${steps} adım`}
            accessibilityLiveRegion="polite"
            style={{ color: c.text, fontSize: 58, fontWeight: '800', letterSpacing: -1.5, fontVariant: ['tabular-nums'] }}
          >
            {fmtInt(steps)}
          </Text>
          <Text style={{ color: c.textMuted, fontSize: 15, fontWeight: '600' }}>adım</Text>
        </View>
      </ProgressRing>

      {paused ? (
        <PausedFooter c={c} onResume={() => run(() => StepTracker.start())} />
      ) : (
        <>
          <Text style={{ color: reached ? c.accent : c.textMuted, fontSize: 15, fontWeight: '600' }}>
            {reached ? 'Günlük hedef tamamlandı' : `Hedef ${fmtInt(goal)} · ${fmtInt(goal - steps)} kaldı`}
          </Text>
          <Button kind="ghost" compact center icon="pause" label="Durdur" onPress={() => run(() => StepTracker.stop())} />
        </>
      )}
    </Card>
  );
}

function PausedFooter({ c, onResume }: { c: Colors; onResume: () => void }) {
  return (
    <View style={{ alignSelf: 'stretch', gap: 14 }}>
      <View style={{ alignItems: 'center', gap: 4 }}>
        <Text style={{ color: c.paused, fontSize: 18, fontWeight: '800' }}>Yürüyüş duraklatıldı</Text>
        <Text style={{ color: c.textMuted, fontSize: 14, textAlign: 'center' }}>Bu sırada atılan adımlar sayılmaz.</Text>
      </View>
      <Button label="Devam et" icon="play" onPress={onResume} />
    </View>
  );
}

function IconBadge({ name, color, bg }: { name: 'shield-lock-outline' | 'cellphone-off'; color: string; bg: string }) {
  return (
    <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={name} size={32} color={color} />
    </View>
  );
}

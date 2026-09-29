import { router, useLocalSearchParams } from 'expo-router';
import Stack from 'expo-router/stack';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import StepTracker from '../../../modules/step-tracker';
import { formatLongDate, isValidKey } from '../../lib/dates';
import { fmt1, fmtInt } from '../../lib/format';
import { dailyLimit } from '../../lib/goal';
import { useHealth } from '../../state/HealthContext';
import { dayMetrics } from '../../state/metrics';
import { useTracker } from '../../state/TrackerContext';
import { ProgressRing } from '../../ui/charts';
import { Card, Footnote, KeyValue, Screen, SectionLabel, Stat } from '../../ui/components';
import { useColors } from '../../ui/theme';

export default function DayScreen() {
  const c = useColors();
  const { date } = useLocalSearchParams<{ date: string }>();
  const { state } = useTracker();
  const { profile, weights } = useHealth();
  const [steps, setSteps] = useState<number | null>(null);

  useEffect(() => {
    if (isValidKey(date)) StepTracker.getDays(date, date).then((rows) => setSteps(rows[0]?.steps ?? null));
  }, [date]);

  if (!isValidKey(date) || !state || !profile) return null;

  const daySteps = date === state.date ? Math.max(state.steps, steps ?? 0) : steps;
  const m = dayMetrics(date, daySteps ?? 0, profile, weights);
  const limit = dailyLimit(profile, m.weightKg, m.walkingKcal, date);
  const pct = Math.round(Math.min(1, (daySteps ?? 0) / m.goal) * 100);

  return (
    <Screen noTopInset>
      <Stack.Screen options={{ title: formatLongDate(date) }} />

      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
        <ProgressRing size={96} stroke={9} progress={(daySteps ?? 0) / m.goal} color={c.accent}>
          <Text style={{ color: c.text, fontSize: 15, fontWeight: '800' }}>{pct}%</Text>
        </ProgressRing>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: c.textMuted, fontSize: 13, fontWeight: '600' }}>Adım</Text>
          <Text style={{ color: c.text, fontSize: 34, fontWeight: '800', fontVariant: ['tabular-nums'] }}>
            {daySteps == null ? '—' : fmtInt(daySteps)}
          </Text>
          <Text style={{ color: m.goalReached ? c.accent : c.textMuted, fontSize: 14, fontWeight: '600' }}>
            {daySteps == null ? 'Bu gün için kayıt yok' : m.goalReached ? 'Hedef tamamlandı' : `Hedef ${fmtInt(m.goal)}`}
          </Text>
        </View>
      </Card>

      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Stat
          icon="map-marker-distance"
          label="Mesafe"
          value={m.distanceKm == null ? '—' : `${m.distanceKm.toFixed(2).replace('.', ',')} km`}
          hint={m.stride == null ? 'Boyunu ekle' : m.stride.source === 'calibrated' ? `${fmt1(m.stride.meters * 100)} cm adım` : 'Boydan tahmin'}
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

      {limit.kind === 'ok' ? (
        <>
          <SectionLabel>O günün sınırı</SectionLabel>
          <Card>
            <KeyValue label={`Vücudunun harcaması (×${fmt1(limit.activityFactor)})`} value={`${fmtInt(limit.base)} kcal`} />
            <KeyValue label="Adımların" value={`+${fmtInt(limit.walking)} kcal`} />
            <KeyValue label="Sınır" value={`${fmtInt(limit.limit)} kcal`} strong />
          </Card>
          <Footnote>Bu kaloriden az yediğin günlerde enerji açığı oluşur. Tahmini bir değerdir.</Footnote>
        </>
      ) : null}
    </Screen>
  );
}

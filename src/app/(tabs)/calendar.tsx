import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import StepTracker from '../../../modules/step-tracker';
import { addDays, addMonths, firstOfMonth, formatMonth, formatShortDate, monthGrid, WEEKDAY_SHORT } from '../../lib/dates';
import { fmtInt } from '../../lib/format';
import { useHealth } from '../../state/HealthContext';
import { dayMetrics } from '../../state/metrics';
import { useTracker } from '../../state/TrackerContext';
import { Card, IconButton, Screen, SectionLabel, Stat, Title } from '../../ui/components';
import { useColors } from '../../ui/theme';

function compact(n: number): string {
  if (n >= 10000) return `${Math.round(n / 1000)}b`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace('.', ',')}b`;
  return String(n);
}

export default function CalendarScreen() {
  const c = useColors();
  const { state } = useTracker();
  const { profile, weights } = useHealth();
  const today = state?.date ?? '1970-01-01';
  const [month, setMonth] = useState(() => firstOfMonth(today));
  const [stored, setStored] = useState<Record<string, number>>({});

  const grid = useMemo(() => monthGrid(month), [month]);
  const gridStart = addDays(month, -grid[0].findIndex((d) => d != null));
  const gridEnd = addDays(month, 41);

  const load = useCallback(async () => {
    const rows = await StepTracker.getDays(gridStart, gridEnd);
    setStored(Object.fromEntries(rows.map((r) => [r.date, r.steps])));
  }, [gridStart, gridEnd]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const stepsOf = (key: string): number | undefined =>
    key === today && state ? Math.max(state.steps, stored[key] ?? 0) : stored[key];

  const goal = profile?.dailyGoal ?? 8000;
  const monthDays = grid.flat().filter((d): d is string => d != null && d <= today);
  const withData = monthDays.filter((d) => stepsOf(d) != null);
  const monthTotal = withData.reduce((s, d) => s + (stepsOf(d) ?? 0), 0);
  const goalDays = withData.filter((d) => (stepsOf(d) ?? 0) >= goal).length;
  const monthKm = dayMetrics(today, monthTotal, profile, weights).distanceKm;

  const weeks = grid
    .map((w) => w.filter((d): d is string => d != null && d <= today))
    .filter((w) => w.length > 0)
    .reverse();

  return (
    <Screen title="Takvim">
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: -8 }}>
          <IconButton icon="chevron-left" label="Önceki ay" onPress={() => setMonth(addMonths(month, -1))} />
          <Title>{formatMonth(month)}</Title>
          <IconButton
            icon="chevron-right"
            label="Sonraki ay"
            disabled={month >= firstOfMonth(today)}
            onPress={() => setMonth(addMonths(month, 1))}
          />
        </View>

        <View style={{ flexDirection: 'row' }}>
          {WEEKDAY_SHORT.map((w) => (
            <Text key={w} style={{ flex: 1, textAlign: 'center', color: c.textFaint, fontSize: 12, fontWeight: '700' }}>
              {w}
            </Text>
          ))}
        </View>

        {grid.map((week, i) => (
          <View key={i} style={{ flexDirection: 'row' }}>
            {week.map((day, j) => {
              if (!day) return <View key={j} style={{ flex: 1 }} />;
              const steps = stepsOf(day);
              const future = day > today;
              const reached = steps != null && steps >= goal;
              const isToday = day === today;
              return (
                <Pressable
                  key={day}
                  disabled={future}
                  accessibilityRole="button"
                  accessibilityLabel={`${formatShortDate(day)}: ${steps == null ? 'kayıt yok' : `${steps} adım`}${reached ? ', hedefe ulaşıldı' : ''}`}
                  onPress={() => router.push({ pathname: '/day/[date]', params: { date: day } })}
                  style={({ pressed }) => ({ flex: 1, alignItems: 'center', paddingVertical: 6, gap: 3, opacity: future ? 0.3 : pressed ? 0.6 : 1 })}
                >
                  <View
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 19,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: reached ? c.accent : 'transparent',
                      borderWidth: isToday && !reached ? 2 : 0,
                      borderColor: c.accent,
                    }}
                  >
                    <Text style={{ color: reached ? c.onAccent : c.text, fontSize: 15, fontWeight: isToday || reached ? '800' : '500' }}>
                      {Number(day.slice(8))}
                    </Text>
                  </View>
                  <Text style={{ color: c.textFaint, fontSize: 10.5, fontVariant: ['tabular-nums'], height: 14 }}>
                    {steps == null ? '' : compact(steps)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ))}
      </Card>

      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Stat label="Toplam" value={fmtInt(monthTotal)} hint={monthKm == null ? undefined : `${monthKm.toFixed(1).replace('.', ',')} km`} />
        <Stat label="Ortalama" value={withData.length ? fmtInt(monthTotal / withData.length) : '—'} hint="günlük" />
        <Stat label="Hedef" value={`${goalDays}`} hint="gün" />
      </View>

      <SectionLabel>Haftalar</SectionLabel>
      <Card>
        {weeks.map((days, i) => {
          const total = days.reduce((s, d) => s + (stepsOf(d) ?? 0), 0);
          const recorded = days.filter((d) => stepsOf(d) != null).length;
          const goals = days.filter((d) => (stepsOf(d) ?? 0) >= goal).length;
          const avg = recorded ? total / recorded : 0;
          return (
            <View key={days[0]} style={{ gap: 8, paddingTop: i === 0 ? 0 : 4 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ color: c.text, fontWeight: '600', fontSize: 15 }}>
                  {formatShortDate(days[0])} – {formatShortDate(days[days.length - 1])}
                </Text>
                <Text style={{ color: c.text, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{fmtInt(total)}</Text>
              </View>
              <View style={{ height: 6, borderRadius: 3, backgroundColor: c.track, overflow: 'hidden' }}>
                <View style={{ width: `${Math.min(1, avg / goal) * 100}%`, height: '100%', backgroundColor: c.accent }} />
              </View>
              <Text style={{ color: c.textMuted, fontSize: 13 }}>
                Günlük ort. {recorded ? fmtInt(avg) : '—'} · {goals}/{days.length} gün hedefte
              </Text>
            </View>
          );
        })}
      </Card>
    </Screen>
  );
}

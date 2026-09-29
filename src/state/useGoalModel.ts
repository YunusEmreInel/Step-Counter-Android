import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';

import StepTracker from '../../modules/step-tracker';
import { distanceKm, effectiveStride, walkingKcal } from '../lib/calc';
import { addDays } from '../lib/dates';
import {
  dailyLimit,
  goalProgress,
  isFastLoss,
  lossRate,
  projectGoal,
  stepsImpact,
  weightTrend,
} from '../lib/goal';
import { useHealth } from './HealthContext';
import { useTracker } from './TrackerContext';

/** Adım ortalaması bu kadar günden alınır (bugün hariç; bugün henüz bitmedi). */
const STEP_AVG_DAYS = 14;
/** "Günde X adım daha" önerisi */
export const EXTRA_STEPS = 2000;

/**
 * Hedef ekranı ve Bugün ekranındaki sınır kartı için tüm türetilmiş değerler.
 * Hesaplar src/lib/goal.ts'teki saf (testli) fonksiyonlardadır; burada yalnızca veriler bir araya getirilir.
 */
export function useGoalModel() {
  const { state } = useTracker();
  const { profile, weights } = useHealth();
  const today = state?.date ?? null;
  const [recentSteps, setRecentSteps] = useState<number[]>([]);

  useFocusEffect(
    useCallback(() => {
      if (!today) return;
      StepTracker.getDays(addDays(today, -STEP_AVG_DAYS), addDays(today, -1)).then((rows) =>
        setRecentSteps(rows.map((r) => r.steps)),
      );
    }, [today]),
  );

  return useMemo(() => {
    if (!state || !profile || !today) return null;
    const trend = weightTrend(weights);
    const latest = trend.length ? trend[trend.length - 1] : null;
    const currentKg = latest?.trendKg ?? null;
    const rate = lossRate(weights, today);
    const stride = effectiveStride(profile);

    const walkingToday = walkingKcal(distanceKm(state.steps, stride), currentKg);
    const limit = dailyLimit(profile, currentKg, walkingToday, today);

    const avgSteps = recentSteps.length ? recentSteps.reduce((s, v) => s + v, 0) / recentSteps.length : null;
    const impact = avgSteps == null ? null : stepsImpact(avgSteps, stride, currentKg);
    const extraImpact = stepsImpact(EXTRA_STEPS, stride, currentKg);

    const goalKg = profile.goalWeightKg;
    const startKg = profile.goalStartWeightKg ?? trend[0]?.trendKg ?? null;
    const progress = goalKg != null && startKg != null && currentKg != null ? goalProgress(startKg, currentKg, goalKg) : null;
    const projection = goalKg != null && currentKg != null ? projectGoal(currentKg, goalKg, rate, today) : null;
    const fastLoss = rate.kind === 'ok' && currentKg != null && isFastLoss(rate.rate, currentKg);

    return {
      today,
      trend,
      currentKg,
      latestDate: latest?.date ?? null,
      rate,
      limit,
      walkingToday,
      avgSteps,
      avgDays: recentSteps.length,
      impact,
      extraImpact,
      goalKg,
      progress,
      projection,
      fastLoss,
      stride,
    };
  }, [state, profile, weights, today, recentSteps]);
}

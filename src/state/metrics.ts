import type { Profile, WeightEntry } from '../../modules/step-tracker';
import { distanceKm, effectiveStride, walkingKcal, weightOnDate, type Stride } from '../lib/calc';

export interface DayMetrics {
  steps: number;
  goal: number;
  goalReached: boolean;
  stride: Stride | null;
  distanceKm: number | null;
  weightKg: number | null;
  walkingKcal: number | null;
}

/** Bir günün adım sayısından türetilen tahminler; ekranlar arasında tek hesap yolu. */
export function dayMetrics(date: string, steps: number, profile: Profile | null, weights: WeightEntry[]): DayMetrics {
  const goal = profile?.dailyGoal ?? 8000;
  const stride = profile ? effectiveStride(profile) : null;
  const distance = distanceKm(steps, stride);
  const weightKg = weightOnDate(weights, date);
  return {
    steps,
    goal,
    goalReached: steps >= goal,
    stride,
    distanceKm: distance,
    weightKg,
    walkingKcal: walkingKcal(distance, weightKg),
  };
}

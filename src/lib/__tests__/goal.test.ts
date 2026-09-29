/// <reference types="jest" />
import type { Profile } from '../../../modules/step-tracker';
import { addDays } from '../dates';
import {
  dailyLimit,
  goalProgress,
  isFastLoss,
  lossRate,
  minHealthyWeight,
  projectGoal,
  stepsImpact,
  validateGoal,
  weightTrend,
} from '../goal';

const profile: Profile = {
  heightCm: 178,
  birthYear: 2003,
  sex: 'male',
  activityFactor: null,
  manualMaintenanceKcal: null,
  strideCm: null,
  dailyGoal: 8000,
  goalWeightKg: 80,
  goalStartDate: '2026-09-01',
  goalStartWeightKg: 89,
};

/** Her 3-4 günde bir, haftada `perWeek` kg düşen ölçümler. */
function series(start: string, days: number, startKg: number, perWeek: number, noise: number[] = []) {
  const out = [];
  for (let d = 0, i = 0; d <= days; d += i % 2 === 0 ? 3 : 4, i++) {
    out.push({ date: addDays(start, d), weightKg: startKg + (perWeek / 7) * d + (noise[i] ?? 0) });
  }
  return out;
}

describe('weight trend', () => {
  it('smooths daily water swings', () => {
    const entries = [
      { date: '2026-09-01', weightKg: 89 },
      { date: '2026-09-04', weightKg: 90.2 }, // tuzlu akşam yemeği
      { date: '2026-09-08', weightKg: 88.6 },
    ];
    const trend = weightTrend(entries);
    expect(trend[1].trendKg).toBeGreaterThan(89);
    expect(trend[1].trendKg).toBeLessThan(90.2);
    expect(trend).toHaveLength(3);
  });

  it('averages two measurements on the same day', () => {
    const trend = weightTrend([
      { date: '2026-09-01', weightKg: 89 },
      { date: '2026-09-01', weightKg: 89.4 },
    ]);
    expect(trend).toHaveLength(1);
    expect(trend[0].weightKg).toBeCloseTo(89.2);
  });
});

describe('loss rate from the scale', () => {
  it('needs enough data before estimating', () => {
    const r = lossRate([{ date: '2026-09-01', weightKg: 89 }, { date: '2026-09-04', weightKg: 88.8 }], '2026-09-05');
    expect(r.kind).toBe('collecting');
  });

  it('recovers the weekly rate and the daily deficit it implies', () => {
    const entries = series('2026-09-01', 21, 89, -0.5, [0.3, -0.4, 0.2, 0.1, -0.2, 0.3, -0.1]);
    const r = lossRate(entries, '2026-09-22');
    expect(r.kind).toBe('ok');
    if (r.kind === 'ok') {
      expect(r.rate.kgPerWeek).toBeCloseTo(-0.5, 0);
      // 0,5 kg/hafta ≈ 550 kcal/gün açık
      expect(r.rate.dailyBalanceKcal).toBeLessThan(-300);
      expect(r.rate.dailyBalanceKcal).toBeGreaterThan(-800);
    }
  });
});

describe('goal progress and projection', () => {
  it('computes lost and remaining kilos', () => {
    const p = goalProgress(89, 86, 80);
    expect(p.lostKg).toBeCloseTo(3);
    expect(p.remainingKg).toBeCloseTo(6);
    expect(p.fraction).toBeCloseTo(1 / 3);
  });

  it('projects an arrival date at the current pace', () => {
    const rate = { kind: 'ok', rate: { kgPerWeek: -0.5, dailyBalanceKcal: -550, spanDays: 21, points: 7 } } as const;
    const p = projectGoal(86, 80, rate, '2026-10-01');
    expect(p.kind).toBe('on_track');
    if (p.kind === 'on_track') {
      expect(p.weeks).toBeCloseTo(12);
      expect(p.etaDate).toBe('2026-12-24');
    }
  });

  it('does not invent a date when weight is not going down', () => {
    const flat = { kind: 'ok', rate: { kgPerWeek: 0.1, dailyBalanceKcal: 110, spanDays: 21, points: 7 } } as const;
    expect(projectGoal(86, 80, flat, '2026-10-01')).toEqual({ kind: 'not_losing' });
    expect(projectGoal(79.8, 80, flat, '2026-10-01')).toEqual({ kind: 'reached' });
  });
});

describe('goal validation and safety', () => {
  it('rejects goals below a healthy BMI', () => {
    expect(minHealthyWeight(178)).toBeCloseTo(58.6, 1);
    expect(validateGoal(55, 89, 178)).toMatch(/VKİ 18,5/);
    expect(validateGoal(80, 89, 178)).toBeNull();
  });

  it('only supports losing weight', () => {
    expect(validateGoal(92, 89, 178)).toMatch(/düşük olmalı/);
  });

  it('warns about losing more than 1% of body weight per week', () => {
    expect(isFastLoss({ kgPerWeek: -1.2, dailyBalanceKcal: -1320, spanDays: 14, points: 5 }, 89)).toBe(true);
    expect(isFastLoss({ kgPerWeek: -0.5, dailyBalanceKcal: -550, spanDays: 14, points: 5 }, 89)).toBe(false);
  });
});

describe('steps and daily limit', () => {
  it('turns average steps into weekly weight impact', () => {
    // 10.000 adım × 0,737 m = 7,37 km; 0,5 × 89 × 7,37 ≈ 328 kcal/gün ≈ 0,30 kg/hafta
    const impact = stepsImpact(10000, { meters: 0.737, source: 'height' }, 89);
    expect(impact!.kcalPerDay).toBeCloseTo(328, 0);
    expect(impact!.kgPerWeek).toBeCloseTo(0.298, 2);
  });

  it('raises the daily limit with steps and assumes a sedentary base when unset', () => {
    const limit = dailyLimit(profile, 89, 300, '2026-09-29');
    expect(limit.kind).toBe('ok');
    if (limit.kind === 'ok') {
      // 10×89 + 6,25×178 − 5×23 + 5 = 1892,5 → × 1,2 = 2271
      expect(limit.bmr).toBeCloseTo(1892.5);
      expect(limit.base).toBeCloseTo(2271);
      expect(limit.limit).toBeCloseTo(2571);
      expect(limit.assumedActivity).toBe(true);
    }
  });

  it('lists what is missing instead of guessing', () => {
    const limit = dailyLimit({ ...profile, sex: null, birthYear: null }, 89, 0, '2026-09-29');
    expect(limit).toEqual({ kind: 'missing', missing: ['doğum yılı', 'cinsiyet'] });
  });
});

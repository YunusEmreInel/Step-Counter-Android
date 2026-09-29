/// <reference types="jest" />
import {
  bmrMifflinStJeor,
  calorieBalance,
  distanceKm,
  effectiveStride,
  estimateExpenditure,
  strideFromCalibration,
  walkingKcal,
  weightOnDate,
} from '../calc';
import type { Profile } from '../../../modules/step-tracker';

const emptyProfile: Profile = {
  heightCm: null,
  birthYear: null,
  sex: null,
  activityFactor: null,
  manualMaintenanceKcal: null,
  strideCm: null,
  dailyGoal: 8000,
  goalWeightKg: null,
  goalStartDate: null,
  goalStartWeightKg: null,
};

describe('stride and distance', () => {
  it('estimates stride from height (height × 0.414)', () => {
    const stride = effectiveStride({ heightCm: 175, strideCm: null });
    expect(stride?.source).toBe('height');
    expect(stride?.meters).toBeCloseTo(0.7245, 4);
    expect(distanceKm(10000, stride)).toBeCloseTo(7.245, 3);
  });

  it('prefers a calibrated stride over height', () => {
    const stride = effectiveStride({ heightCm: 175, strideCm: 80 });
    expect(stride).toEqual({ meters: 0.8, source: 'calibrated' });
  });

  it('does not invent a distance without height or calibration', () => {
    expect(effectiveStride({ heightCm: null, strideCm: null })).toBeNull();
    expect(distanceKm(5000, null)).toBeNull();
  });

  it('calibrates stride from a known walk', () => {
    expect(strideFromCalibration(100, 130)).toBeCloseTo(76.92, 2);
    expect(strideFromCalibration(100, 0)).toBeNull();
  });
});

describe('walking calories', () => {
  it('uses 0.5 kcal per kg per km (ACSM net walking cost)', () => {
    expect(walkingKcal(5, 70)).toBeCloseTo(175);
  });

  it('needs weight', () => {
    expect(walkingKcal(5, null)).toBeNull();
    expect(walkingKcal(null, 70)).toBeNull();
  });
});

describe('daily expenditure', () => {
  it('matches the Mifflin-St Jeor equation', () => {
    // 10×70 + 6.25×175 − 5×30 + 5 = 1648.75
    expect(bmrMifflinStJeor('male', 70, 175, 30)).toBeCloseTo(1648.75);
    // 10×60 + 6.25×165 − 5×40 − 161 = 1270.25
    expect(bmrMifflinStJeor('female', 60, 165, 40)).toBeCloseTo(1270.25);
  });

  it('refuses to compute with only height and weight', () => {
    const result = estimateExpenditure({ ...emptyProfile, heightCm: 175 }, 70, 200, '2026-06-01');
    expect(result.kind).toBe('missing');
    if (result.kind === 'missing') {
      expect(result.missing).toEqual(['doğum yılı', 'denklemdeki cinsiyet parametresi', 'temel aktivite düzeyi']);
    }
  });

  it('adds walking once on top of a base factor that excludes steps', () => {
    const profile: Profile = { ...emptyProfile, heightCm: 175, birthYear: 1996, sex: 'male', activityFactor: 1.2 };
    const result = estimateExpenditure(profile, 70, 175, '2026-06-01');
    expect(result.kind).toBe('formula');
    if (result.kind === 'formula') {
      expect(result.bmr).toBeCloseTo(1648.75);
      expect(result.base).toBeCloseTo(1978.5);
      expect(result.total).toBeCloseTo(1978.5 + 175);
    }
  });

  it('uses the manual maintenance value as-is without adding walking again', () => {
    const result = estimateExpenditure({ ...emptyProfile, manualMaintenanceKcal: 2300 }, null, 400, '2026-06-01');
    expect(result).toEqual({ kind: 'manual', total: 2300 });
  });
});

describe('calorie balance', () => {
  const expenditure = { kind: 'manual', total: 2200 } as const;

  it('reports missing data instead of a deficit when intake was not entered', () => {
    expect(calorieBalance(null, expenditure)).toEqual({ kind: 'missing_intake' });
  });

  it('computes intake minus estimated expenditure', () => {
    expect(calorieBalance(1900, expenditure)).toEqual({ kind: 'ok', intake: 1900, expenditure: 2200, balance: -300 });
  });

  it('reports missing expenditure', () => {
    expect(calorieBalance(1900, { kind: 'missing', missing: ['kilo'] })).toEqual({ kind: 'missing_expenditure' });
  });
});

describe('weight on a date', () => {
  it('uses the latest measurement up to that date', () => {
    const weights = [
      { date: '2026-05-01', weightKg: 80 },
      { date: '2026-05-10', weightKg: 79 },
      { date: '2026-05-20', weightKg: 78 },
    ];
    expect(weightOnDate(weights, '2026-05-15')).toBe(79);
    expect(weightOnDate(weights, '2026-04-30')).toBeNull();
  });
});

/**
 * Kilo hedefi: tartı eğilimi, gerçek kayıp hızı, hedefe varış tahmini ve adımların katkısı.
 *
 * Yaklaşım (yemek saymadan): Kullanıcının kaç kalori yediğini bilmiyoruz, ama tartı gerçeği söyler.
 * Tartıdaki eğilimin eğiminden günlük ortalama enerji dengesi geri hesaplanır:
 *   denge (kcal/gün) ≈ kilo değişimi (kg/gün) × 7.700 kcal/kg
 * 7.700 kcal ≈ 1 kg vücut yağı yaygın kullanılan bir yaklaşımdır; kısa vadede su kaybı nedeniyle kayıp daha
 * hızlı, uzun vadede vücut uyum sağladıkça daha yavaş görünebilir. Tüm sonuçlar tahmindir.
 */
import type { Profile } from '../../modules/step-tracker';
import { ageFromBirthYear, bmrMifflinStJeor, distanceKm, walkingKcal, type Stride } from './calc';
import { addDays, daysBetween } from './dates';

export const KCAL_PER_KG = 7700;
/** Eğilim ortalamasının zaman sabiti: bir ölçümün etkisi ~7 günde yaklaşık üçte birine iner. */
export const TREND_TAU_DAYS = 7;
/** Kayıp hızı bu penceredeki ölçümlerden hesaplanır. */
export const RATE_WINDOW_DAYS = 28;
export const RATE_MIN_POINTS = 3;
export const RATE_MIN_SPAN_DAYS = 10;
/** Sağlıklı VKİ alt sınırı (WHO). Hedef bunun altında girilemez. */
export const MIN_HEALTHY_BMI = 18.5;
/** Haftada vücut ağırlığının %1'inden hızlı kayıp uyarı gerektirir. */
export const FAST_LOSS_FRACTION_PER_WEEK = 0.01;
/** Kullanıcı seçmediyse: masa başı, hareketsiz gün (adımlar hariç). Arayüzde varsayım olarak gösterilir. */
export const DEFAULT_ACTIVITY_FACTOR = 1.2;

interface Measurement {
  date: string;
  weightKg: number;
}

export interface TrendPoint {
  date: string;
  weightKg: number;
  trendKg: number;
}

/** Aynı gündeki ölçümlerin ortalaması, tarihe göre sıralı. */
function dailyMeans(entries: Measurement[]): Measurement[] {
  const byDay = new Map<string, number[]>();
  for (const e of entries) byDay.set(e.date, [...(byDay.get(e.date) ?? []), e.weightKg]);
  return [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, values]) => ({ date, weightKg: values.reduce((s, v) => s + v, 0) / values.length }));
}

/**
 * Zaman ağırlıklı üstel ortalama: ölçümler arası boşluk büyüdükçe yeni ölçümün etkisi artar.
 * Su ve tuza bağlı ±1 kg'lık günlük oynamaları yumuşatır; asıl yönü gösterir.
 */
export function weightTrend(entries: Measurement[]): TrendPoint[] {
  const points = dailyMeans(entries);
  const result: TrendPoint[] = [];
  let trend: number | null = null;
  let prevDate: string | null = null;
  for (const p of points) {
    if (trend == null || prevDate == null) {
      trend = p.weightKg;
    } else {
      const alpha = 1 - Math.exp(-daysBetween(prevDate, p.date) / TREND_TAU_DAYS);
      trend = trend + alpha * (p.weightKg - trend);
    }
    prevDate = p.date;
    result.push({ date: p.date, weightKg: p.weightKg, trendKg: trend });
  }
  return result;
}

export interface LossRate {
  /** Negatif = kilo veriliyor */
  kgPerWeek: number;
  /** Tartıya göre günlük ortalama enerji dengesi; negatif = açık */
  dailyBalanceKcal: number;
  spanDays: number;
  points: number;
}

export type RateResult = { kind: 'ok'; rate: LossRate } | { kind: 'collecting'; points: number; spanDays: number };

/** Son 28 günün ölçümlerine en küçük kareler doğrusu; eğim = kayıp hızı. */
export function lossRate(entries: Measurement[], today: string): RateResult {
  const from = addDays(today, -RATE_WINDOW_DAYS);
  const points = dailyMeans(entries).filter((p) => p.date >= from && p.date <= today);
  const spanDays = points.length ? daysBetween(points[0].date, points[points.length - 1].date) : 0;
  if (points.length < RATE_MIN_POINTS || spanDays < RATE_MIN_SPAN_DAYS) {
    return { kind: 'collecting', points: points.length, spanDays };
  }
  const xs = points.map((p) => daysBetween(points[0].date, p.date));
  const ys = points.map((p) => p.weightKg);
  const mx = xs.reduce((s, v) => s + v, 0) / xs.length;
  const my = ys.reduce((s, v) => s + v, 0) / ys.length;
  let num = 0;
  let den = 0;
  for (let i = 0; i < xs.length; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  const kgPerDay = den === 0 ? 0 : num / den;
  return {
    kind: 'ok',
    rate: { kgPerWeek: kgPerDay * 7, dailyBalanceKcal: kgPerDay * KCAL_PER_KG, spanDays, points: points.length },
  };
}

export interface GoalProgress {
  startKg: number;
  currentKg: number;
  goalKg: number;
  lostKg: number;
  remainingKg: number;
  /** 0..1 */
  fraction: number;
}

export function goalProgress(startKg: number, currentKg: number, goalKg: number): GoalProgress {
  const total = startKg - goalKg;
  const lost = startKg - currentKg;
  return {
    startKg,
    currentKg,
    goalKg,
    lostKg: lost,
    remainingKg: Math.max(0, currentKg - goalKg),
    fraction: total <= 0 ? 1 : Math.max(0, Math.min(1, lost / total)),
  };
}

export type Projection =
  | { kind: 'reached' }
  | { kind: 'on_track'; weeks: number; etaDate: string }
  | { kind: 'not_losing' }
  | { kind: 'collecting' };

export function projectGoal(currentKg: number, goalKg: number, rate: RateResult, today: string): Projection {
  if (currentKg <= goalKg) return { kind: 'reached' };
  if (rate.kind === 'collecting') return { kind: 'collecting' };
  const perWeek = -rate.rate.kgPerWeek;
  // Haftada 50 g'dan yavaş kayıp, tahmin için anlamlı değil.
  if (perWeek < 0.05) return { kind: 'not_losing' };
  const weeks = (currentKg - goalKg) / perWeek;
  return { kind: 'on_track', weeks, etaDate: addDays(today, Math.round(weeks * 7)) };
}

export function bmi(weightKg: number, heightCm: number): number {
  const m = heightCm / 100;
  return weightKg / (m * m);
}

export function minHealthyWeight(heightCm: number): number {
  const m = heightCm / 100;
  return MIN_HEALTHY_BMI * m * m;
}

/** Hedef geçerli değilse kullanıcıya gösterilecek açıklama; geçerliyse null. */
export function validateGoal(goalKg: number, currentKg: number | null, heightCm: number | null): string | null {
  if (!(goalKg >= 30 && goalKg <= 300)) return 'Hedef kilo 30–300 kg arasında olmalı.';
  if (heightCm == null) return 'Hedef belirlemek için önce boyunu gir.';
  if (currentKg == null) return 'Hedef belirlemek için önce bir tartı ölçümü ekle.';
  if (goalKg >= currentKg) return 'Hedef kilo şu anki kilondan düşük olmalı.';
  const min = minHealthyWeight(heightCm);
  if (goalKg < min) {
    return `Bu boy için sağlıklı aralığın alt sınırı yaklaşık ${min.toFixed(1).replace('.', ',')} kg (VKİ 18,5). Daha düşük bir hedef belirlenemez.`;
  }
  return null;
}

export function isFastLoss(rate: LossRate, weightKg: number): boolean {
  return -rate.kgPerWeek > FAST_LOSS_FRACTION_PER_WEEK * weightKg;
}

export interface StepsImpact {
  kcalPerDay: number;
  kgPerWeek: number;
}

/** Ortalama günlük adımın yaktığı net enerji ve bunun haftalık kilo karşılığı. */
export function stepsImpact(avgSteps: number, stride: Stride | null, weightKg: number | null): StepsImpact | null {
  const kcal = walkingKcal(distanceKm(avgSteps, stride), weightKg);
  if (kcal == null) return null;
  return { kcalPerDay: kcal, kgPerWeek: (kcal * 7) / KCAL_PER_KG };
}

export type DailyLimit =
  | {
      kind: 'ok';
      bmr: number;
      activityFactor: number;
      /** Kullanıcı hareket düzeyini seçmediyse varsayılan kullanıldı */
      assumedActivity: boolean;
      base: number;
      walking: number;
      limit: number;
    }
  | { kind: 'missing'; missing: string[] };

/**
 * Günlük sınır: bu kaloriden az yenirse enerji açığı oluşur (tahmini).
 *   sınır = Mifflin-St Jeor dinlenme harcaması × hareket katsayısı (adımlar hariç) + o günün adım enerjisi
 * Adım attıkça sınır yükselir; aynı hareket katsayıda ve adımlarda iki kez sayılmaz.
 */
export function dailyLimit(profile: Profile, weightKg: number | null, walkingKcalToday: number | null, today: string): DailyLimit {
  const missing: string[] = [];
  if (weightKg == null) missing.push('kilo');
  if (profile.heightCm == null) missing.push('boy');
  if (profile.birthYear == null) missing.push('doğum yılı');
  if (profile.sex == null) missing.push('cinsiyet');
  if (missing.length) return { kind: 'missing', missing };
  const bmr = bmrMifflinStJeor(profile.sex!, weightKg!, profile.heightCm!, ageFromBirthYear(profile.birthYear!, today));
  const activityFactor = profile.activityFactor ?? DEFAULT_ACTIVITY_FACTOR;
  const base = bmr * activityFactor;
  const walking = walkingKcalToday ?? 0;
  return { kind: 'ok', bmr, activityFactor, assumedActivity: profile.activityFactor == null, base, walking, limit: base + walking };
}

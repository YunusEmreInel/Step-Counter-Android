/**
 * Mesafe, yürüyüş kalorisi ve günlük enerji ihtiyacı hesapları.
 *
 * Hepsi TAHMİNDİR. Kullanıcının vermediği bir bilgi için varsayılan sayı uydurulmaz: gerekli girdi
 * eksikse sonuç `null` / "eksik" olarak döner ve arayüz neyin eksik olduğunu söyler.
 */
import type { Profile, Sex } from '../../modules/step-tracker';

// ---------------------------------------------------------------------------------------------
// Adım uzunluğu ve mesafe
// ---------------------------------------------------------------------------------------------

/**
 * Boydan adım uzunluğu tahmini: boy × 0,414.
 * Pedometre literatüründe ve üretici kılavuzlarında yaygın kullanılan yaklaşık orandır (kadınlarda ~0,413,
 * erkeklerde ~0,415). Kişiden kişiye ve yürüme hızına göre %10'u aşan sapmalar olabilir; bu yüzden
 * kullanıcı elle kalibre edebilir.
 */
export const STRIDE_HEIGHT_RATIO = 0.414;

export type StrideSource = 'calibrated' | 'height';

export interface Stride {
  meters: number;
  source: StrideSource;
}

export function strideFromHeightCm(heightCm: number): number {
  return (heightCm * STRIDE_HEIGHT_RATIO) / 100;
}

/** Kalibre edilmiş adım uzunluğu boydan tahmine göre önceliklidir. İkisi de yoksa null. */
export function effectiveStride(profile: Pick<Profile, 'strideCm' | 'heightCm'>): Stride | null {
  if (profile.strideCm != null && profile.strideCm > 0) {
    return { meters: profile.strideCm / 100, source: 'calibrated' };
  }
  if (profile.heightCm != null && profile.heightCm > 0) {
    return { meters: strideFromHeightCm(profile.heightCm), source: 'height' };
  }
  return null;
}

/** Kalibrasyon: bilinen bir mesafeyi yürüyüp adımları sayınca adım uzunluğu = mesafe / adım. */
export function strideFromCalibration(meters: number, steps: number): number | null {
  if (!(meters > 0) || !(steps > 0)) return null;
  return (meters / steps) * 100; // cm
}

export function distanceKm(steps: number, stride: Stride | null): number | null {
  if (stride == null) return null;
  return (steps * stride.meters) / 1000;
}

// ---------------------------------------------------------------------------------------------
// Yürüyüş kalorisi
// ---------------------------------------------------------------------------------------------

/**
 * Düz zeminde yürüyüşün NET enerji maliyeti, ACSM yürüme denkleminin yatay bileşeninden:
 *   VO2 (yatay) = 0,1 mL O2 / kg / m
 *   1 L O2 ≈ 5 kcal
 *   → 0,1 mL × 1000 m = 100 mL = 0,1 L O2 / kg / km → 0,5 kcal / kg / km
 *
 * "Net": dinlenme enerjisi (BMR) hariç, yalnızca yürümenin eklediği enerji. Bu sayede aşağıdaki günlük
 * toplamda BMR ile üst üste binmez. Eğim, hız, yük ve kişisel verimlilik hesaba katılmaz.
 */
export const NET_WALK_KCAL_PER_KG_KM = 0.5;

export function walkingKcal(distance: number | null, weightKg: number | null): number | null {
  if (distance == null || weightKg == null || !(weightKg > 0)) return null;
  return NET_WALK_KCAL_PER_KG_KM * weightKg * distance;
}

// ---------------------------------------------------------------------------------------------
// Günlük enerji ihtiyacı
// ---------------------------------------------------------------------------------------------

/**
 * Mifflin-St Jeor (1990) dinlenme enerji harcaması denklemi:
 *   10 × kilo(kg) + 6,25 × boy(cm) − 5 × yaş + s
 *   s = +5 (erkek), −161 (kadın)
 * Denklem biyolojik cinsiyet parametresi gerektirir; kullanıcı vermezse hesaplanmaz.
 */
export function bmrMifflinStJeor(sex: Sex, weightKg: number, heightCm: number, ageYears: number): number {
  return 10 * weightKg + 6.25 * heightCm - 5 * ageYears + (sex === 'male' ? 5 : -161);
}

/**
 * Temel aktivite katsayıları: ADIMLAR HARİÇ günün geri kalanını tanımlar.
 * Yürüyüş kalorisini ayrıca eklediğimiz için klasik "hafif / orta aktif" katsayıları (yürüyüşü de içerir)
 * kullanılmaz; aksi halde aynı hareket iki kez sayılırdı. 1,2 değeri Harris-Benedict / Mifflin ile yaygın
 * kullanılan "hareketsiz" katsayısıdır (dinlenme + besinlerin termik etkisi + çok az günlük hareket).
 * Üst değerler ayakta çalışma ve bedensel iş için yaklaşık değerlerdir.
 */
export const ACTIVITY_LEVELS = [
  { factor: 1.2, short: 'Oturarak', label: 'Çoğunlukla oturarak', hint: 'Masa başı iş, gün içinde az ayakta kalma (×1,2)' },
  { factor: 1.3, short: 'Ayakta', label: 'Ayakta geçen gün', hint: 'Ayakta çalışma, ev işleri (×1,3)' },
  { factor: 1.45, short: 'Bedensel iş', label: 'Bedensel iş', hint: 'Taşıma, kaldırma gibi yorucu iş (×1,45)' },
] as const;

export function ageFromBirthYear(birthYear: number, today: string): number {
  return Number(today.slice(0, 4)) - birthYear;
}

export type ExpenditureEstimate =
  | {
      kind: 'formula';
      /** Dinlenme (BMR) × temel aktivite katsayısı */
      base: number;
      bmr: number;
      activityFactor: number;
      walking: number;
      total: number;
    }
  | { kind: 'manual'; total: number }
  | { kind: 'missing'; missing: string[] };

/**
 * Tahmini toplam günlük harcama.
 *  - Kullanıcı kendi bakım kalorisini girdiyse o değer olduğu gibi kullanılır. Bu değer kişinin olağan
 *    hareketini zaten içerdiği varsayılır, bu yüzden yürüyüş kalorisi EKLENMEZ (çift sayım olmasın).
 *  - Aksi halde: BMR × temel aktivite katsayısı (adımlar hariç) + o günün net yürüyüş kalorisi.
 */
export function estimateExpenditure(
  profile: Profile,
  weightKg: number | null,
  walkingKcalToday: number | null,
  today: string,
): ExpenditureEstimate {
  if (profile.manualMaintenanceKcal != null && profile.manualMaintenanceKcal > 0) {
    return { kind: 'manual', total: profile.manualMaintenanceKcal };
  }
  const missing: string[] = [];
  if (weightKg == null) missing.push('kilo');
  if (profile.heightCm == null) missing.push('boy');
  if (profile.birthYear == null) missing.push('doğum yılı');
  if (profile.sex == null) missing.push('denklemdeki cinsiyet parametresi');
  if (profile.activityFactor == null) missing.push('temel aktivite düzeyi');
  if (missing.length > 0) return { kind: 'missing', missing };

  const bmr = bmrMifflinStJeor(profile.sex!, weightKg!, profile.heightCm!, ageFromBirthYear(profile.birthYear!, today));
  const base = bmr * profile.activityFactor!;
  const walking = walkingKcalToday ?? 0;
  return { kind: 'formula', base, bmr, activityFactor: profile.activityFactor!, walking, total: base + walking };
}

export type CalorieBalance =
  | { kind: 'ok'; intake: number; expenditure: number; balance: number }
  | { kind: 'missing_intake' }
  | { kind: 'missing_expenditure' };

/** Tüketim girilmediyse açık/fazla hakkında hiçbir şey söylenmez. Pozitif denge = harcanandan fazla alındı. */
export function calorieBalance(intakeKcal: number | null, expenditure: ExpenditureEstimate): CalorieBalance {
  if (intakeKcal == null) return { kind: 'missing_intake' };
  if (expenditure.kind === 'missing') return { kind: 'missing_expenditure' };
  return {
    kind: 'ok',
    intake: intakeKcal,
    expenditure: expenditure.total,
    balance: intakeKcal - expenditure.total,
  };
}

/** Kullanılan kilo: o güne kadarki en son ölçüm. */
export function weightOnDate(weights: { date: string; weightKg: number }[], date: string): number | null {
  let best: { date: string; weightKg: number } | null = null;
  for (const w of weights) {
    if (w.date <= date && (best == null || w.date > best.date)) best = w;
  }
  return best?.weightKg ?? null;
}

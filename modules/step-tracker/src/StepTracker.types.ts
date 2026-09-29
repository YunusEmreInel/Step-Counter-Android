/** Kotlin tarafındaki TrackerState.toMap() ile birebir aynı alanlar. */
export type TrackerStatus = 'permission_required' | 'unsupported' | 'stopped' | 'counting';
export type RecordingAvailability = 'available' | 'update_required' | 'unavailable';

export interface TrackerState {
  /** Bugünün yerel tarihi, "YYYY-MM-DD" */
  date: string;
  steps: number;
  status: TrackerStatus;
  trackingEnabled: boolean;
  notificationEnabled: boolean;
  lockScreenEnabled: boolean;
  hiddenByAction: boolean;
  activityPermission: boolean;
  notificationPermission: boolean;
  hasLiveSensor: boolean;
  /** Canlı sayımın kaynağı: filtrelenmiş donanım sayacı, yedek dedektör ya da yok */
  liveSensor: 'counter' | 'detector' | 'none';
  recording: RecordingAvailability;
  recordingActive: boolean;
  lockScreenVisible: boolean;
  liveServiceRunning: boolean;
  onboardingDone: boolean;
  lastSyncMillis: number;
}

export interface DaySteps {
  date: string;
  steps: number;
}

export type Sex = 'female' | 'male';

export interface Profile {
  heightCm: number | null;
  birthYear: number | null;
  sex: Sex | null;
  /** Adımlar HARİÇ temel aktivite katsayısı */
  activityFactor: number | null;
  manualMaintenanceKcal: number | null;
  strideCm: number | null;
  dailyGoal: number;
  /** Hedef kilo (yalnızca kilo verme hedefi desteklenir) */
  goalWeightKg: number | null;
  /** Hedefin belirlendiği gün ve o günkü kilo; ilerleme buradan ölçülür */
  goalStartDate: string | null;
  goalStartWeightKg: number | null;
}

export interface WeighReminder {
  enabled: boolean;
  /** 1 = Pazartesi ... 7 = Pazar; ikinci gün 3 gün sonrası */
  firstDay: number;
  hour: number;
}

export interface WeightEntry {
  id: number;
  date: string;
  weightKg: number;
}

export interface IntakeEntry {
  date: string;
  kcal: number;
}

export type StepTrackerEvents = {
  onStateChange(state: TrackerState): void;
};

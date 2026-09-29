import { NativeModule, requireNativeModule } from 'expo';

import type {
  DaySteps,
  IntakeEntry,
  Profile,
  StepTrackerEvents,
  TrackerState,
  WeighReminder,
  WeightEntry,
} from './StepTracker.types';

declare class StepTrackerModule extends NativeModule<StepTrackerEvents> {
  getState(): Promise<TrackerState>;
  setAppActive(active: boolean): Promise<TrackerState>;
  start(): Promise<TrackerState>;
  stop(): Promise<TrackerState>;
  hideNotification(): Promise<TrackerState>;
  setNotificationEnabled(enabled: boolean): Promise<TrackerState>;
  setLockScreenEnabled(enabled: boolean): Promise<TrackerState>;
  completeOnboarding(): Promise<TrackerState>;
  syncNow(): Promise<TrackerState>;
  getDays(from: string, to: string): Promise<DaySteps[]>;
  deleteStepHistory(): Promise<TrackerState>;
  deleteAllData(): Promise<TrackerState>;

  getProfile(): Promise<Profile>;
  saveProfile(profile: Profile): Promise<void>;
  getWeights(): Promise<WeightEntry[]>;
  addWeight(date: string, weightKg: number): Promise<number>;
  deleteWeight(id: number): Promise<void>;
  getIntake(from: string, to: string): Promise<IntakeEntry[]>;
  setIntake(date: string, kcal: number | null): Promise<void>;

  getWeighReminder(): WeighReminder;
  setWeighReminder(enabled: boolean, firstDay: number, hour: number): void;

  openAppSettings(): void;
  openNotificationSettings(): void;
}

export default requireNativeModule<StepTrackerModule>('StepTracker');

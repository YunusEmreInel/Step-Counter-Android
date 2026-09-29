import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import StepTracker, { type Profile, type WeightEntry } from '../../modules/step-tracker';

interface HealthContextValue {
  profile: Profile | null;
  weights: WeightEntry[];
  saveProfile: (profile: Profile) => Promise<void>;
  addWeight: (date: string, kg: number) => Promise<void>;
  deleteWeight: (id: number) => Promise<void>;
  reload: () => Promise<void>;
}

const HealthContext = createContext<HealthContextValue | null>(null);

/** Profil ve kilo ölçümleri (Room'da saklanır, yerel modül üzerinden okunur). */
export function HealthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [weights, setWeights] = useState<WeightEntry[]>([]);

  const reload = useCallback(async () => {
    const [p, w] = await Promise.all([StepTracker.getProfile(), StepTracker.getWeights()]);
    setProfile(p);
    setWeights(w);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const value = useMemo<HealthContextValue>(
    () => ({
      profile,
      weights,
      reload,
      saveProfile: async (p) => {
        await StepTracker.saveProfile(p);
        await reload();
      },
      addWeight: async (date, kg) => {
        await StepTracker.addWeight(date, kg);
        await reload();
      },
      deleteWeight: async (id) => {
        await StepTracker.deleteWeight(id);
        await reload();
      },
    }),
    [profile, weights, reload],
  );

  return <HealthContext.Provider value={value}>{children}</HealthContext.Provider>;
}

export function useHealth(): HealthContextValue {
  const ctx = useContext(HealthContext);
  if (!ctx) throw new Error('useHealth must be used inside HealthProvider');
  return ctx;
}

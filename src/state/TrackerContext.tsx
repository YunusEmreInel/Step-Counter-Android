import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import StepTracker, { type TrackerState } from '../../modules/step-tracker';

interface TrackerContextValue {
  state: TrackerState | null;
  /** Yerel modülün döndürdüğü yeni durumu uygular (her eylem sonrası). */
  run: (action: () => Promise<TrackerState>) => Promise<TrackerState | null>;
  refresh: () => Promise<void>;
  error: string | null;
}

const TrackerContext = createContext<TrackerContextValue | null>(null);

/**
 * Adım durumunun TypeScript tarafındaki tek kaynağı.
 *
 * Asıl hesap Kotlin'deki StepEngine'dedir. Burada yalnızca:
 *  - "onStateChange" olaylarını dinleriz (her sensör adımında gelir, sayı birer birer artar),
 *  - uygulama öne/arkaya geçtiğinde yerel modüle haber veririz (canlı sensörü açıp kapatır, eşitleme yapar).
 */
export function TrackerProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<TrackerState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  const apply = useCallback((next: TrackerState) => {
    if (mounted.current) setState(next);
  }, []);

  const run = useCallback(
    async (action: () => Promise<TrackerState>) => {
      try {
        const next = await action();
        apply(next);
        setError(null);
        return next;
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        return null;
      }
    },
    [apply],
  );

  const refresh = useCallback(async () => {
    await run(() => StepTracker.getState());
  }, [run]);

  useEffect(() => {
    mounted.current = true;
    const sub = StepTracker.addListener('onStateChange', apply);
    // Açılışta durum 'unknown' olabilir; ekran bu kod çalışırken zaten görünür.
    run(() => StepTracker.setAppActive(AppState.currentState !== 'background'));
    const appSub = AppState.addEventListener('change', (s) => {
      // Arka plandan dönüşte kayıtlı toplamla eşitleme yerel tarafta tetiklenir.
      run(() => StepTracker.setAppActive(s === 'active'));
    });
    return () => {
      mounted.current = false;
      sub.remove();
      appSub.remove();
    };
  }, [apply, run]);

  const value = useMemo(() => ({ state, run, refresh, error }), [state, run, refresh, error]);
  return <TrackerContext.Provider value={value}>{children}</TrackerContext.Provider>;
}

export function useTracker(): TrackerContextValue {
  const ctx = useContext(TrackerContext);
  if (!ctx) throw new Error('useTracker must be used inside TrackerProvider');
  return ctx;
}

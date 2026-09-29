import { BlurTargetView, BlurView } from 'expo-blur';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { BackHandler, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, useColorScheme, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconButton } from './components';
import { radius, useColors } from './theme';

type Position = 'center' | 'bottom';

interface OverlayApi {
  open: (content: ReactNode, position?: Position) => void;
  close: () => void;
}

const OverlayContext = createContext<OverlayApi | null>(null);

/**
 * Uygulamanın üstünde açılan küçük pencereler (bilgi kutusu, profil düzenleme).
 * Arka plan, Android'de expo-blur'un gerçek bulanıklığıyla (BlurTargetView) görünür kalır; Android 12 öncesinde
 * bulanıklık yerine yarı saydam bir perde kullanılır. Geri tuşu ve boşluğa dokunma pencereyi kapatır.
 */
export function OverlayHost({ children }: { children: ReactNode }) {
  const c = useColors();
  const scheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const target = useRef<View>(null);
  const [overlay, setOverlay] = useState<{ content: ReactNode; position: Position } | null>(null);

  const close = useCallback(() => setOverlay(null), []);
  const open = useCallback((content: ReactNode, position: Position = 'center') => setOverlay({ content, position }), []);

  useEffect(() => {
    if (!overlay) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      close();
      return true;
    });
    return () => sub.remove();
  }, [overlay, close]);

  const api = useMemo(() => ({ open, close }), [open, close]);
  const bottom = overlay?.position === 'bottom';

  return (
    <OverlayContext.Provider value={api}>
      <View style={{ flex: 1 }}>
        <BlurTargetView ref={target} style={{ flex: 1 }}>
          {children}
        </BlurTargetView>
        {overlay ? (
          <View style={StyleSheet.absoluteFill}>
            <BlurView
              blurTarget={target}
              blurMethod="dimezisBlurViewSdk31Plus"
              intensity={45}
              tint={scheme === 'dark' ? 'dark' : 'light'}
              style={StyleSheet.absoluteFill}
            />
            <Pressable accessibilityLabel="Kapat" style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.25)' }]} onPress={close} />
            <KeyboardAvoidingView
              behavior="padding"
              pointerEvents="box-none"
              style={{
                flex: 1,
                justifyContent: bottom ? 'flex-end' : 'center',
                paddingHorizontal: bottom ? 0 : 20,
                paddingTop: insets.top + 24,
              }}
            >
              <View
                accessibilityViewIsModal
                style={{
                  backgroundColor: c.surface,
                  borderRadius: radius.card + 4,
                  borderBottomLeftRadius: bottom ? 0 : radius.card + 4,
                  borderBottomRightRadius: bottom ? 0 : radius.card + 4,
                  maxHeight: '100%',
                  paddingBottom: bottom ? insets.bottom : 0,
                }}
              >
                <View style={{ position: 'absolute', right: 6, top: 6, zIndex: 1 }}>
                  <IconButton icon="close" label="Kapat" color={c.textMuted} onPress={close} />
                </View>
                <ScrollView contentContainerStyle={{ padding: 22, paddingTop: 22, gap: 14 }} keyboardShouldPersistTaps="handled">
                  {overlay.content}
                </ScrollView>
              </View>
            </KeyboardAvoidingView>
          </View>
        ) : null}
      </View>
    </OverlayContext.Provider>
  );
}

export function useOverlay(): OverlayApi {
  const ctx = useContext(OverlayContext);
  if (!ctx) throw new Error('useOverlay must be used inside OverlayHost');
  return ctx;
}

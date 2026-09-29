import Stack from 'expo-router/stack';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { HealthProvider } from '../state/HealthContext';
import { TrackerProvider } from '../state/TrackerContext';
import { OverlayHost } from '../ui/Overlay';
import { useColors } from '../ui/theme';

export default function RootLayout() {
  const c = useColors();
  const scheme = useColorScheme();
  return (
    <SafeAreaProvider>
      <TrackerProvider>
        <HealthProvider>
          <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
          <OverlayHost>
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: c.background },
              headerTintColor: c.text,
              headerShadowVisible: false,
              headerTitleStyle: { fontWeight: '700' },
              contentStyle: { backgroundColor: c.background },
            }}
          >
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false }} />
            <Stack.Screen name="day/[date]" options={{ title: '' }} />
          </Stack>
          </OverlayHost>
        </HealthProvider>
      </TrackerProvider>
    </SafeAreaProvider>
  );
}

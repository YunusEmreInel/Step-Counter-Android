import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { router } from 'expo-router';
import Tabs from 'expo-router/js-tabs';
import { useEffect } from 'react';
import { ActivityIndicator, View, type ColorValue } from 'react-native';

import { useTracker } from '../../state/TrackerContext';
import { useColors } from '../../ui/theme';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

function icon(name: IconName) {
  return ({ color, size }: { color: ColorValue; size: number }) => (
    <MaterialCommunityIcons name={name} color={color as string} size={size} />
  );
}

export default function TabsLayout() {
  const c = useColors();
  const { state } = useTracker();

  useEffect(() => {
    if (state && !state.onboardingDone) router.replace('/onboarding');
  }, [state]);

  if (!state) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.background }}>
        <ActivityIndicator color={c.accent} accessibilityLabel="Yükleniyor" />
      </View>
    );
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.accent,
        tabBarInactiveTintColor: c.textFaint,
        tabBarStyle: { backgroundColor: c.surface, borderTopWidth: 0, elevation: 0 },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '700' },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Bugün', tabBarIcon: icon('shoe-print') }} />
      <Tabs.Screen name="calendar" options={{ title: 'Takvim', tabBarIcon: icon('calendar-month') }} />
      <Tabs.Screen name="weight" options={{ title: 'Hedef', tabBarIcon: icon('flag-checkered') }} />
      <Tabs.Screen name="settings" options={{ title: 'Ayarlar', tabBarIcon: icon('cog-outline') }} />
    </Tabs>
  );
}

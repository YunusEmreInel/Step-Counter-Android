import { useColorScheme } from 'react-native';

const light = {
  background: '#F3F5F4',
  surface: '#FFFFFF',
  surfaceAlt: '#E9EEEC',
  track: '#DDE4E1',
  separator: '#E3E8E6',
  text: '#101614',
  textMuted: '#5E6B66',
  textFaint: '#8A9691',
  accent: '#0A8A5F',
  accentSoft: '#D6F1E5',
  onAccent: '#FFFFFF',
  paused: '#A86A00',
  pausedSoft: '#FCEFD6',
  danger: '#C4372E',
  dangerSoft: '#FBE5E3',
  info: '#2563A8',
  infoSoft: '#E2ECF8',
};

const dark: typeof light = {
  background: '#0A0E0D',
  surface: '#131917',
  surfaceAlt: '#1B2320',
  track: '#222C28',
  separator: '#222A27',
  text: '#F1F4F3',
  textMuted: '#9AA6A1',
  textFaint: '#66726D',
  accent: '#3DDC97',
  accentSoft: '#12291F',
  onAccent: '#04150D',
  paused: '#F4B740',
  pausedSoft: '#2A2110',
  danger: '#FF7A70',
  dangerSoft: '#2E1513',
  info: '#8CB8F2',
  infoSoft: '#132033',
};

export type Colors = typeof light;

export function useColors(): Colors {
  return useColorScheme() === 'dark' ? dark : light;
}

/** Erişilebilir dokunma alanı için en az 48dp. */
export const MIN_TOUCH = 48;

export const radius = { card: 20, control: 14, pill: 999 };

import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Children, isValidElement, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MIN_TOUCH, radius, useColors } from './theme';

export type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

export function Icon({ name, size = 22, color }: { name: IconName; size?: number; color: string }) {
  return <MaterialCommunityIcons name={name} size={size} color={color} />;
}

// ---------------------------------------------------------------------------------------------
// Sayfa iskeleti
// ---------------------------------------------------------------------------------------------

export function Screen({
  children,
  title,
  subtitle,
  right,
  noTopInset,
}: {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  right?: ReactNode;
  noTopInset?: boolean;
}) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.background }}
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: (noTopInset ? 0 : insets.top) + 16, paddingBottom: 32, gap: 16 }}
      keyboardShouldPersistTaps="handled"
    >
      {title ? (
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
          <View style={{ flex: 1 }}>
            {subtitle ? <Text style={{ color: c.textMuted, fontSize: 14, marginBottom: 2 }}>{subtitle}</Text> : null}
            <Text accessibilityRole="header" style={{ color: c.text, fontSize: 32, fontWeight: '800', letterSpacing: -0.5 }}>
              {title}
            </Text>
          </View>
          {right}
        </View>
      ) : null}
      {children}
    </ScrollView>
  );
}

export function Card({ children, style, padded = true }: { children: ReactNode; style?: ViewStyle; padded?: boolean }) {
  const c = useColors();
  return (
    <View style={[{ backgroundColor: c.surface, borderRadius: radius.card, gap: 12 }, padded && { padding: 18 }, style]}>
      {children}
    </View>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  const c = useColors();
  return (
    <Text
      accessibilityRole="header"
      style={{ color: c.textMuted, fontSize: 13, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', marginLeft: 4, marginBottom: -8 }}
    >
      {children}
    </Text>
  );
}

export function Title({ children }: { children: ReactNode }) {
  const c = useColors();
  return <Text style={{ color: c.text, fontSize: 18, fontWeight: '700' }}>{children}</Text>;
}

export function Body({ children, muted, small }: { children: ReactNode; muted?: boolean; small?: boolean }) {
  const c = useColors();
  return (
    <Text style={{ color: muted ? c.textMuted : c.text, fontSize: small ? 13 : 15, lineHeight: small ? 18 : 21 }}>{children}</Text>
  );
}

export function Footnote({ children }: { children: ReactNode }) {
  const c = useColors();
  return <Text style={{ color: c.textFaint, fontSize: 12.5, lineHeight: 17, marginHorizontal: 4 }}>{children}</Text>;
}

// ---------------------------------------------------------------------------------------------
// Düğmeler
// ---------------------------------------------------------------------------------------------

type ButtonKind = 'primary' | 'tonal' | 'ghost' | 'danger';

export function Button({
  label,
  onPress,
  kind = 'primary',
  icon,
  disabled,
  busy,
  compact,
  center,
}: {
  label: string;
  onPress: () => void;
  kind?: ButtonKind;
  icon?: IconName;
  disabled?: boolean;
  busy?: boolean;
  compact?: boolean;
  /** compact düğmeyi yatayda ortalar */
  center?: boolean;
}) {
  const c = useColors();
  const bg = { primary: c.accent, tonal: c.surfaceAlt, ghost: 'transparent', danger: c.dangerSoft }[kind];
  const fg = { primary: c.onAccent, tonal: c.text, ghost: c.accent, danger: c.danger }[kind];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, busy: !!busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        compact && { paddingHorizontal: 14, alignSelf: center ? 'center' : 'flex-start' },
        { backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.75 : 1 },
      ]}
    >
      {busy ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon ? <Icon name={icon} size={20} color={fg} /> : null}
          <Text style={{ color: fg, fontSize: 16, fontWeight: '700' }}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

export function IconButton({ icon, label, onPress, disabled, color }: { icon: IconName; label: string; onPress: () => void; disabled?: boolean; color?: string }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => ({
        width: MIN_TOUCH,
        height: MIN_TOUCH,
        borderRadius: MIN_TOUCH / 2,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.3 : pressed ? 0.6 : 1,
      })}
    >
      <Icon name={icon} size={24} color={color ?? c.text} />
    </Pressable>
  );
}

// ---------------------------------------------------------------------------------------------
// Gruplu liste (Ayarlar tarzı)
// ---------------------------------------------------------------------------------------------

export function Group({ children }: { children: ReactNode }) {
  const c = useColors();
  const items = Children.toArray(children).filter(isValidElement);
  return (
    <View style={{ backgroundColor: c.surface, borderRadius: radius.card, overflow: 'hidden' }}>
      {items.map((child, i) => (
        <View key={i}>
          {i > 0 ? <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.separator, marginLeft: 60 }} /> : null}
          {child}
        </View>
      ))}
    </View>
  );
}

export function Row({
  icon,
  iconColor,
  title,
  subtitle,
  value,
  onPress,
  right,
  destructive,
  disabled,
}: {
  icon?: IconName;
  iconColor?: string;
  title: string;
  subtitle?: string;
  value?: string;
  onPress?: () => void;
  right?: ReactNode;
  destructive?: boolean;
  disabled?: boolean;
}) {
  const c = useColors();
  const tint = destructive ? c.danger : iconColor ?? c.accent;
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      disabled={!onPress || disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.row, { opacity: disabled ? 0.45 : 1, backgroundColor: pressed ? c.surfaceAlt : 'transparent' }]}
    >
      {icon ? (
        <View style={[styles.rowIcon, { backgroundColor: destructive ? c.dangerSoft : c.surfaceAlt }]}>
          <Icon name={icon} size={20} color={tint} />
        </View>
      ) : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: destructive ? c.danger : c.text, fontSize: 16, fontWeight: '600' }}>{title}</Text>
        {subtitle ? <Text style={{ color: c.textMuted, fontSize: 13, lineHeight: 18 }}>{subtitle}</Text> : null}
      </View>
      {value ? <Text style={{ color: c.textMuted, fontSize: 15 }}>{value}</Text> : null}
      {right}
      {onPress && !right ? <Icon name="chevron-right" size={22} color={c.textFaint} /> : null}
    </Pressable>
  );
}

export function SwitchRow({
  icon,
  title,
  subtitle,
  value,
  onChange,
  disabled,
}: {
  icon?: IconName;
  title: string;
  subtitle?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={title}
      accessibilityState={{ checked: value, disabled: !!disabled }}
      disabled={disabled}
      onPress={() => onChange(!value)}
      style={[styles.row, { opacity: disabled ? 0.45 : 1 }]}
    >
      {icon ? (
        <View style={[styles.rowIcon, { backgroundColor: c.surfaceAlt }]}>
          <Icon name={icon} size={20} color={c.accent} />
        </View>
      ) : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: c.text, fontSize: 16, fontWeight: '600' }}>{title}</Text>
        {subtitle ? <Text style={{ color: c.textMuted, fontSize: 13, lineHeight: 18 }}>{subtitle}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ true: c.accent, false: c.track }}
        thumbColor={value ? c.onAccent : c.textMuted}
        importantForAccessibility="no"
      />
    </Pressable>
  );
}

// ---------------------------------------------------------------------------------------------
// Durum ve bilgi
// ---------------------------------------------------------------------------------------------

export function Pill({ label, color, background, icon, onPress }: { label: string; color: string; background: string; icon?: IconName; onPress?: () => void }) {
  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : 'text'}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: background, borderRadius: radius.pill, paddingHorizontal: 12, minHeight: 32 }}
    >
      {icon ? <Icon name={icon} size={14} color={color} /> : <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />}
      <Text style={{ color, fontSize: 13, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
}

export type NoticeTone = 'info' | 'warning' | 'danger';

export function Notice({ tone, icon, title, text, children }: { tone: NoticeTone; icon: IconName; title: string; text?: string; children?: ReactNode }) {
  const c = useColors();
  const [bg, fg] = { info: [c.infoSoft, c.info], warning: [c.pausedSoft, c.paused], danger: [c.dangerSoft, c.danger] }[tone];
  return (
    <View style={{ backgroundColor: bg, borderRadius: radius.card, padding: 16, gap: 12 }}>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Icon name={icon} size={22} color={fg} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={{ color: fg, fontSize: 15, fontWeight: '700' }}>{title}</Text>
          {text ? <Text style={{ color: c.text, fontSize: 14, lineHeight: 20 }}>{text}</Text> : null}
        </View>
      </View>
      {children}
    </View>
  );
}

export function Stat({ icon, label, value, hint, onPress }: { icon?: IconName; label: string; value: string; hint?: string; onPress?: () => void }) {
  const c = useColors();
  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      style={{ flex: 1, backgroundColor: c.surface, borderRadius: radius.card, padding: 16, gap: 6 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {icon ? <Icon name={icon} size={16} color={c.textMuted} /> : null}
        <Text style={{ color: c.textMuted, fontSize: 13, fontWeight: '600' }}>{label}</Text>
      </View>
      <Text style={{ color: c.text, fontSize: 22, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{value}</Text>
      {hint ? <Text style={{ color: onPress ? c.accent : c.textFaint, fontSize: 12.5, fontWeight: onPress ? '600' : '400' }}>{hint}</Text> : null}
    </Pressable>
  );
}

export function KeyValue({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 2 }}>
      <Text style={{ color: strong ? c.text : c.textMuted, fontSize: 15, fontWeight: strong ? '700' : '400', flex: 1 }}>{label}</Text>
      <Text style={{ color: c.text, fontSize: 15, fontWeight: strong ? '800' : '600', fontVariant: ['tabular-nums'] }}>{value}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------------------------
// Form
// ---------------------------------------------------------------------------------------------

export function Field({ label, suffix, ...input }: TextInputProps & { label: string; suffix?: string }) {
  const c = useColors();
  return (
    <View style={{ gap: 6, flex: 1 }}>
      <Text style={{ color: c.textMuted, fontSize: 13, fontWeight: '600' }}>{label}</Text>
      <View style={[styles.field, { backgroundColor: c.surfaceAlt }]}>
        <TextInput
          accessibilityLabel={label}
          placeholderTextColor={c.textFaint}
          style={{ flex: 1, color: c.text, fontSize: 16, minHeight: MIN_TOUCH }}
          {...input}
        />
        {suffix ? <Text style={{ color: c.textMuted, fontSize: 15 }}>{suffix}</Text> : null}
      </View>
    </View>
  );
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (v: T | null) => void;
}) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', backgroundColor: c.surfaceAlt, borderRadius: radius.control, padding: 4, gap: 4 }}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => onChange(selected ? null : o.value)}
            style={{
              flex: 1,
              minHeight: 40,
              borderRadius: radius.control - 4,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: selected ? c.accentSoft : 'transparent',
              borderWidth: selected ? 1.5 : 0,
              borderColor: c.accent,
            }}
          >
            <Text style={{ color: selected ? c.accent : c.textMuted, fontSize: 14, fontWeight: selected ? '800' : '600' }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: MIN_TOUCH + 4,
    borderRadius: radius.control,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 60, paddingHorizontal: 14, paddingVertical: 10 },
  rowIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  field: { flexDirection: 'row', alignItems: 'center', borderRadius: radius.control, paddingHorizontal: 14, gap: 8 },
});

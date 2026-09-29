import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from 'react-native-svg';

import { daysBetween } from '../lib/dates';
import { useColors } from './theme';

export function ProgressRing({
  size,
  stroke,
  progress,
  color,
  children,
}: {
  size: number;
  stroke: number;
  progress: number;
  color: string;
  children?: ReactNode;
}) {
  const c = useColors();
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, progress));
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={c.track} strokeWidth={stroke} fill="none" />
        {p > 0 ? (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={color}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={circumference * (1 - p)}
          />
        ) : null}
      </Svg>
      {children}
    </View>
  );
}

/** Son günlerin adımları; hedef çizgisi kesikli, bugün vurgulu. */
export function DayBars({
  days,
  goal,
  height = 120,
}: {
  days: { key: string; label: string; steps: number | null; today?: boolean }[];
  goal: number;
  height?: number;
}) {
  const c = useColors();
  const max = Math.max(goal * 1.15, ...days.map((d) => d.steps ?? 0));
  const goalY = height - (goal / max) * height;
  return (
    <View style={{ gap: 8 }}>
      <View style={{ height }}>
        <Svg width="100%" height={height} style={{ position: 'absolute' }}>
          <Line x1="0" x2="100%" y1={goalY} y2={goalY} stroke={c.textFaint} strokeWidth={1} strokeDasharray="4 5" />
        </Svg>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'flex-end', gap: 10 }}>
          {days.map((d) => {
            const h = d.steps ? Math.max(4, (d.steps / max) * height) : 4;
            const reached = (d.steps ?? 0) >= goal;
            return (
              <View key={d.key} style={{ flex: 1, alignItems: 'center' }}>
                <View
                  style={{
                    width: '100%',
                    maxWidth: 28,
                    height: h,
                    borderRadius: 8,
                    backgroundColor: reached ? c.accent : d.today ? c.textMuted : c.track,
                    opacity: d.steps == null ? 0.5 : 1,
                  }}
                />
              </View>
            );
          })}
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {days.map((d) => (
          <Text
            key={d.key}
            style={{ flex: 1, textAlign: 'center', fontSize: 12, fontWeight: d.today ? '800' : '500', color: d.today ? c.text : c.textFaint }}
          >
            {d.label}
          </Text>
        ))}
      </View>
    </View>
  );
}

/**
 * Hedef grafiği: tartı ölçümleri (soluk noktalar), eğilim çizgisi, hedef kilo (kesikli yatay çizgi) ve
 * mevcut hızla hedefe tahmini gidiş (kesikli). X ekseni gerçek tarihlere göre ölçeklenir.
 */
export function GoalChart({
  points,
  goalKg,
  today,
  etaDate,
  width,
  height = 190,
}: {
  points: { date: string; weightKg: number; trendKg: number }[];
  goalKg: number | null;
  today: string;
  etaDate: string | null;
  width: number;
  height?: number;
}) {
  const c = useColors();
  if (width <= 0 || points.length === 0) return <View style={{ height }} />;
  const padX = 8;
  const padTop = 14;
  const padBottom = 22;
  const first = points[0].date;
  const end = etaDate && etaDate > today ? etaDate : today;
  const span = Math.max(1, daysBetween(first, end));
  const values = points.flatMap((p) => [p.weightKg, p.trendKg]);
  if (goalKg != null) values.push(goalKg);
  const lo = Math.floor(Math.min(...values) - 0.5);
  const hi = Math.ceil(Math.max(...values) + 0.5);
  const x = (date: string) => padX + (daysBetween(first, date) / span) * (width - 2 * padX);
  const y = (kg: number) => padTop + (1 - (kg - lo) / (hi - lo)) * (height - padTop - padBottom);
  const trendPath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.date).toFixed(1)},${y(p.trendKg).toFixed(1)}`).join(' ');
  const last = points[points.length - 1];
  const fmtDate = (key: string) => `${Number(key.slice(8))}.${key.slice(5, 7)}`;
  return (
    <View>
      <Svg width={width} height={height}>
        {goalKg != null ? (
          <>
            <Line x1={padX} x2={width - padX} y1={y(goalKg)} y2={y(goalKg)} stroke={c.accent} strokeWidth={1.5} strokeDasharray="6 6" opacity={0.7} />
            <SvgText x={width - padX} y={y(goalKg) - 6} fill={c.accent} fontSize={11} fontWeight="700" textAnchor="end">
              {`Hedef ${goalKg.toFixed(1).replace('.', ',')}`}
            </SvgText>
          </>
        ) : null}
        {etaDate && goalKg != null && etaDate > last.date ? (
          <Line
            x1={x(last.date)}
            y1={y(last.trendKg)}
            x2={x(etaDate)}
            y2={y(goalKg)}
            stroke={c.accent}
            strokeWidth={2}
            strokeDasharray="3 6"
            opacity={0.6}
          />
        ) : null}
        {points.map((p) => (
          <Circle key={p.date} cx={x(p.date)} cy={y(p.weightKg)} r={3} fill={c.textFaint} />
        ))}
        {points.length > 1 ? <Path d={trendPath} stroke={c.accent} strokeWidth={3} fill="none" strokeLinejoin="round" strokeLinecap="round" /> : null}
        <Circle cx={x(last.date)} cy={y(last.trendKg)} r={5.5} fill={c.accent} />
        <SvgText x={padX} y={height - 4} fill={c.textFaint} fontSize={11}>
          {fmtDate(first)}
        </SvgText>
        <SvgText x={width - padX} y={height - 4} fill={c.textFaint} fontSize={11} textAnchor="end">
          {end === today ? 'bugün' : fmtDate(end)}
        </SvgText>
      </Svg>
    </View>
  );
}

/** Kilo ölçümleri için basit çizgi grafik (eşit aralıklı noktalar). */
export function LineChart({ values, width, height = 140 }: { values: number[]; width: number; height?: number }) {
  const c = useColors();
  if (values.length === 0 || width <= 0) return <View style={{ height }} />;
  const pad = 10;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (i: number) => (values.length === 1 ? width / 2 : pad + (i * (width - 2 * pad)) / (values.length - 1));
  const y = (v: number) => pad + (1 - (v - min) / span) * (height - 2 * pad);
  const d = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const area = `${d} L${x(values.length - 1).toFixed(1)},${height} L${x(0).toFixed(1)},${height} Z`;
  return (
    <Svg width={width} height={height}>
      <Rect x={0} y={0} width={width} height={height} fill="transparent" />
      {values.length > 1 ? <Path d={area} fill={c.accentSoft} /> : null}
      {values.length > 1 ? <Path d={d} stroke={c.accent} strokeWidth={2.5} fill="none" strokeLinejoin="round" /> : null}
      {values.map((v, i) => (
        <Circle key={i} cx={x(i)} cy={y(v)} r={i === values.length - 1 ? 5 : 3} fill={c.accent} />
      ))}
    </Svg>
  );
}

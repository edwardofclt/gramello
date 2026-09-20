import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import type { Trend } from '../lib/types';
import { formatDate } from '../lib/nutrition';
import { Action, colors, isWeb, styles, useLayout } from './ui';

const chartFont = isWeb ? 'system-ui, sans-serif' : undefined;

export function NutritionChart({ days, goal, kind }: { days: Trend[]; goal: number; kind: 'calories' | 'macros' }) {
  const { desktop } = useLayout();
  const [width, setWidth] = useState(280);
  const [selection, setSelection] = useState<number | null>(null);
  const index = Math.min(selection ?? days.length - 1, days.length - 1);
  const active = days[index];
  const chartHeight = desktop ? 250 : 190;
  const left = 42, top = 12, bottom = top + chartHeight;
  const plotWidth = Math.max(1, width - left - 12);
  const maximum = kind === 'calories' ? Math.max(goal, ...days.map(day => day.calories)) : Math.max(...days.map(day => day.protein + day.carbs + day.fat));
  const step = kind === 'calories' ? 500 : 50;
  const ceiling = Math.max(step, Math.ceil(maximum * 1.1 / step) * step);
  const x = (i: number) => left + (days.length === 1 ? plotWidth / 2 : (i + .5) * plotWidth / days.length);
  const y = (value: number) => bottom - value / ceiling * chartHeight;
  const line = days.map((day, i) => `${i ? 'L' : 'M'} ${x(i)},${y(day.calories)}`).join(' ');
  const labelIndices = new Set([0, Math.floor((days.length - 1) / 2), days.length - 1]);
  const select = (i: number) => setSelection(Math.max(0, Math.min(days.length - 1, i)));
  const description = (day: Trend) => kind === 'calories' ? `${Math.round(day.calories).toLocaleString()} kcal · goal ${Math.round(goal).toLocaleString()}`
    : `P ${Math.round(day.protein)}g · C ${Math.round(day.carbs)}g · F ${Math.round(day.fat)}g`;

  return <View testID={`${kind}-chart`} style={{ gap: 10 }}>
    <View onLayout={event => setWidth(Math.max(1, event.nativeEvent.layout.width))} style={{ height: bottom + 30 }}>
      <Svg width="100%" height={bottom + 30} accessibilityLabel={kind === 'calories' ? 'Calories over time chart' : 'Daily macro mix chart'}>
        <Defs><LinearGradient id="calorieFill" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={colors.mint} stopOpacity={.38} /><Stop offset="1" stopColor={colors.mint} stopOpacity={.02} /></LinearGradient></Defs>
        {[0, .25, .5, .75, 1].map(fraction => <ViewTick key={fraction} value={ceiling * fraction} y={y(ceiling * fraction)} width={width} />)}
        {kind === 'calories' ? <>
          <Line x1={left} x2={width - 12} y1={y(goal)} y2={y(goal)} stroke={colors.blue} strokeWidth={2} strokeDasharray="5 5" />
          <Path d={`${line} L ${x(days.length - 1)},${bottom} L ${x(0)},${bottom} Z`} fill="url(#calorieFill)" />
          <Path d={line} fill="none" stroke={colors.mint} strokeWidth={3} strokeLinejoin="round" />
          {days.map((day, i) => <Circle key={day.date} cx={x(i)} cy={y(day.calories)} r={i === index ? 5 : days.length < 15 ? 3 : 0} fill={colors.mint} />)}
        </> : days.map((day, i) => {
          const barWidth = Math.max(1, Math.min(44, plotWidth / days.length * .62));
          const factor = chartHeight / ceiling;
          return <G key={day.date}>
            <Rect x={x(i) - barWidth / 2} y={y(day.protein)} width={barWidth} height={day.protein * factor} fill={colors.mint} />
            <Rect x={x(i) - barWidth / 2} y={y(day.protein + day.carbs)} width={barWidth} height={day.carbs * factor} fill={colors.blue} />
            <Rect x={x(i) - barWidth / 2} y={y(day.protein + day.carbs + day.fat)} width={barWidth} height={day.fat * factor} fill={colors.amber} />
          </G>;
        })}
        {[...labelIndices].map(i => <SvgText key={i} x={x(i)} y={bottom + 23} fill={colors.muted} fontFamily={chartFont} fontSize={11} textAnchor={i === 0 && days.length > 1 ? 'start' : i === days.length - 1 && days.length > 1 ? 'end' : 'middle'}>{formatDate(days[i].date, true)}</SvgText>)}
      </Svg>
      <View style={{ position: 'absolute', top, bottom: 30, left, right: 12, flexDirection: 'row' }}>
        {days.map((day, i) => <Pressable key={day.date} tabIndex={-1} accessibilityRole="button" accessibilityLabel={`${formatDate(day.date)}: ${description(day)}`}
          onHoverIn={() => select(i)} onPress={() => select(i)} style={{ flex: 1, borderLeftWidth: i === index ? 1 : 0, borderLeftColor: '#8ca1b233' }} />)}
      </View>
    </View>
    {active && <View style={[styles.between, { backgroundColor: '#102b3d', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8 }]}>
      <Action quiet secondary compact label={`Previous ${kind} chart day`} disabled={index === 0} onPress={() => select(index - 1)}><ChevronLeft size={16} color={colors.muted} /></Action>
      <View style={{ flex: 1, gap: 3, alignItems: 'center' }}><Text style={{ color: colors.text, fontSize: 12, fontWeight: '600' }}>{formatDate(active.date)}</Text><Text style={[styles.muted, { fontSize: 11, textAlign: 'center' }]}>{description(active)}</Text></View>
      <Action quiet secondary compact label={`Next ${kind} chart day`} disabled={index === days.length - 1} onPress={() => select(index + 1)}><ChevronRight size={16} color={colors.muted} /></Action>
    </View>}
  </View>;
}

function ViewTick({ value, y, width }: { value: number; y: number; width: number }) {
  return <G><Line x1={42} x2={width - 12} y1={y} y2={y} stroke={colors.border} strokeDasharray="3 5" /><SvgText x={32} y={y + 4} textAnchor="end" fill={colors.muted} fontFamily={chartFont} fontSize={11}>{Math.round(value).toLocaleString()}</SvgText></G>;
}

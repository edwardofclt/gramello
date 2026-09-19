import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import Svg, { Line, Path } from 'react-native-svg';
import { TrendingUp } from 'lucide-react-native';
import { useSession } from '../auth/Session';
import { Action, Card, colors, ErrorNotice, Loading, styles } from '../components/ui';
import { formatDate, localDate, shiftDate, sumNutrition } from '../lib/nutrition';
import type { Trend } from '../lib/types';
import { useResource } from '../lib/useResource';

function CalorieChart({ days, range }: { days: Trend[]; range: number }) {
  const [width, setWidth] = useState(280);
  const height = 150;
  const byDate = new Map(days.map(day => [day.date, day.calories]));
  const values = Array.from({ length: range }, (_, index) => byDate.get(shiftDate(localDate(), index - range + 1)) ?? 0);
  const max = Math.max(1, ...values);
  const points = values.map((value, index) => `${index * width / (range - 1)},${height - value / max * (height - 12)}`);
  const line = `M ${points.join(' L ')}`;
  return <View style={{ gap: 12 }} onLayout={event => setWidth(Math.max(1, event.nativeEvent.layout.width))}>
    <View style={styles.between}><Text style={styles.muted}>Calories</Text><Text style={styles.muted}>Peak {Math.round(max)} kcal</Text></View>
    <View accessible accessibilityLabel={`Calorie trend over ${range} days. Highest logged day: ${Math.round(max)} calories.`}>
      <Svg width={width} height={height + 2}>
        {[0, .5, 1].map(fraction => <Line key={fraction} x1={0} x2={width} y1={height * fraction} y2={height * fraction} stroke={colors.border} strokeDasharray="4 5" />)}
        <Path d={`${line} L ${width},${height} L 0,${height} Z`} fill={colors.mint} opacity={.1} />
        <Path d={line} fill="none" stroke={colors.mint} strokeWidth={2.5} strokeLinejoin="round" />
      </Svg>
    </View>
    <View style={styles.between}><Text style={styles.muted}>{formatDate(shiftDate(localDate(), 1 - range), true)}</Text><Text style={styles.muted}>Today</Text></View>
    <Text style={styles.muted}>Days without entries appear as 0. Averages use logged days only.</Text>
  </View>;
}

export function TrendsScreen() {
  const { api } = useSession();
  const [range, setRange] = useState(7);
  const { data, error, loading, reload } = useResource<{ days: Trend[] }>(api, `/api/trends?days=${range}`);
  const days = data?.days ?? [];
  const totals = sumNutrition(days);
  const average = (key: keyof typeof totals) => days.length ? Math.round(totals[key] / days.length) : 0;
  return <ScrollView contentContainerStyle={styles.content}>
    <View><Text style={styles.eyebrow}>NUTRITION ANALYTICS</Text><Text style={styles.title}>Your progress</Text><Text style={styles.muted}>Small choices. A bigger picture.</Text></View>
    <View style={styles.row}>{[{ days: 7, label: '7 days' }, { days: 30, label: '30 days' }, { days: 183, label: '6 months' }].map(item => <View key={item.days} style={{ flex: 1 }}><Action compact secondary={range !== item.days} onPress={() => setRange(item.days)}>{item.label}</Action></View>)}</View>
    {error && <ErrorNotice message={error} retry={reload} />}
    {loading ? <Loading label="Loading your trends…" /> : data && !days.length ? <Card><View style={styles.center}><TrendingUp size={40} color={colors.mint} /><Text style={styles.heading}>Your story starts here</Text><Text style={[styles.muted, { textAlign: 'center' }]}>Log a meal in your diary to start seeing your nutrition patterns.</Text></View></Card> : data && <>
      <Card><Text style={styles.eyebrow}>AVERAGE DAILY ENERGY</Text><Text style={[styles.title, { fontSize: 42 }]}>{average('calories').toLocaleString()}<Text style={styles.muted}> kcal</Text></Text><Text style={styles.muted}>{days.length} logged {days.length === 1 ? 'day' : 'days'} in this period</Text><CalorieChart days={days} range={range} /></Card>
      <Card><Text style={styles.heading}>Your daily averages</Text>{([{ key: 'protein', color: colors.mint, label: 'Protein' }, { key: 'carbs', color: colors.blue, label: 'Carbs' }, { key: 'fat', color: colors.amber, label: 'Fat' }] as const).map(item => <View key={item.key} style={styles.between}><View style={styles.row}><View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: item.color }} /><Text style={styles.body}>{item.label}</Text></View><Text style={styles.heading}>{average(item.key)}<Text style={styles.muted}> g</Text></Text></View>)}</Card>
      <Card><Text style={styles.heading}>Recent logged days</Text>{days.slice(-7).reverse().map(day => <View style={styles.between} key={day.date}><Text style={styles.muted}>{formatDate(day.date)}</Text><Text style={styles.body}>{Math.round(day.calories).toLocaleString()} kcal</Text></View>)}</Card>
    </>}
  </ScrollView>;
}

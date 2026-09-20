import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { TrendingUp } from 'lucide-react-native';
import { useSession } from '../auth/Session';
import { Action, Card, colors, ErrorNotice, isWeb, Loading, styles, useLayout } from '../components/ui';
import { NutritionChart } from '../components/NutritionChart';
import { localDate, sumNutrition } from '../lib/nutrition';
import type { Day, Trend } from '../lib/types';
import { useResource } from '../lib/useResource';

export function TrendsScreen({ range, onRange }: { range: number; onRange: (range: number) => void }) {
  const { api } = useSession();
  const { desktop, wide, pageStyle } = useLayout();
  const [date] = useState(localDate);
  const { data, error, loading, reload } = useResource<{ days: Trend[] }>(api, `/api/trends?days=${range}`);
  const goalsResource = useResource<Day>(api, `/api/day?date=${date}`);
  const goals = goalsResource.data?.goals;
  const days = [...(data?.days ?? [])].sort((a, b) => a.date.localeCompare(b.date));
  const totals = sumNutrition(days);
  const average = (key: keyof typeof totals) => days.length ? Math.round(totals[key] / days.length) : 0;
  const adherence = days.length && goals ? Math.round(days.filter(day => Math.abs(day.calories - goals.calories) <= goals.calories * .1).length / days.length * 100) : 0;
  const proteinDays = goals ? days.filter(day => day.protein >= goals.protein * .9).length : 0;
  const pending = loading || goalsResource.loading;
  const stats = [
    { label: 'Average calories', value: average('calories').toLocaleString(), detail: 'daily kcal' },
    { label: 'Goal-range days', value: `${adherence}%`, detail: 'within ±10%' },
    { label: 'Average protein', value: `${average('protein')}g`, detail: `${goals ? Math.round(average('protein') - goals.protein) : '—'}g vs target` },
    { label: 'Protein target', value: String(proteinDays), detail: 'days at 90%+' },
  ];
  return <ScrollView contentContainerStyle={pageStyle}>
    {!isWeb && <View><Text style={styles.eyebrow}>NUTRITION ANALYTICS</Text><Text style={styles.title}>Your progress</Text></View>}
    <View style={{ flexDirection: desktop ? 'row' : 'column', justifyContent: 'space-between', gap: 16 }}>
      <View style={{ gap: 5 }}><Text style={styles.eyebrow}>ROLLING VIEW</Text><Text accessibilityRole="header" style={[styles.heading, { fontSize: 23 }]}>Nutrition trends</Text></View>
      <View style={[styles.row, { gap: 4, padding: 4, borderRadius: 13, backgroundColor: '#102b3d', borderWidth: 1, borderColor: colors.border }]}>
        {[{ days: 7, label: '7 days' }, { days: 30, label: '30 days' }, { days: 183, label: '6 months' }].map(item => <View key={item.days} style={desktop ? {} : { flex: 1 }}><Action compact secondary={range !== item.days} quiet={range !== item.days} style={{ minHeight: 36 }} onPress={() => onRange(item.days)}>{item.label}</Action></View>)}
      </View>
    </View>
    {error && <ErrorNotice message={error} retry={reload} />}
    {goalsResource.error && <ErrorNotice message={goalsResource.error} retry={goalsResource.reload} />}
    {pending ? <Loading label="Loading your trends…" /> : data && goals && <>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
        {stats.map(stat => <Card key={stat.label} style={{ flexBasis: wide ? '22%' : '46%', flexGrow: 1, padding: 18, borderRadius: 17, gap: 8 }}>
          <Text style={[styles.muted, { fontSize: 12 }]}>{stat.label}</Text><Text style={[styles.title, { fontSize: 27 }]}>{stat.value}</Text><Text style={[styles.muted, { fontSize: 11 }]}>{stat.detail}</Text>
        </Card>)}
      </View>
      <Card style={{ borderRadius: 20 }}>
        <View style={styles.between}><View style={{ flex: 1, gap: 5 }}><Text style={styles.eyebrow}>ENERGY</Text><Text style={styles.heading}>Calories over time</Text></View><Legend items={[{ label: 'Actual', color: colors.mint }, { label: 'Goal', color: colors.blue }]} /></View>
        {days.length ? <NutritionChart key={`calories-${range}`} days={days} goal={goals.calories} kind="calories" />
          : <View style={[styles.center, { minHeight: 250 }]}><TrendingUp size={36} color={colors.mint} /><Text style={[styles.heading, { textAlign: 'center' }]}>Your chart starts with your first logged day</Text><Text style={[styles.muted, { textAlign: 'center' }]}>Food you log today will appear here automatically.</Text></View>}
      </Card>
      <Card style={{ borderRadius: 20 }}>
        <View style={styles.between}><View style={{ flex: 1, gap: 5 }}><Text style={styles.eyebrow}>MACRONUTRIENTS</Text><Text style={styles.heading}>Daily macro mix</Text></View><Legend items={[{ label: 'Protein', color: colors.mint }, { label: 'Carbs', color: colors.blue }, { label: 'Fat', color: colors.amber }]} /></View>
        {days.length ? <NutritionChart key={`macros-${range}`} days={days} goal={goals.calories} kind="macros" /> : <View style={styles.center}><Text style={styles.muted}>No macro data in this range yet.</Text></View>}
      </Card>
      <Text style={styles.muted}>{days.length} logged {days.length === 1 ? 'day' : 'days'} in this period. Charts and averages use logged days only.</Text>
    </>}
  </ScrollView>;
}

function Legend({ items }: { items: { label: string; color: string }[] }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 10, maxWidth: '45%' }}>{items.map(item => <View key={item.label} style={[styles.row, { gap: 5 }]}><View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: item.color }} /><Text style={{ color: colors.muted, fontSize: 11 }}>{item.label}</Text></View>)}</View>;
}

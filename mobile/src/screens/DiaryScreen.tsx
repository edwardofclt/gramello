import { useRef, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { CalendarDays, ChevronLeft, ChevronRight, Coffee, Moon, Plus, Sun, Target, Trash2, Utensils } from 'lucide-react-native';
import { useSession } from '../auth/Session';
import { Action, colors, ErrorNotice, isWeb, Loading, Meter, styles, useLayout } from '../components/ui';
import { AppDialog } from '../components/AppDialog';
import { CalorieRing } from '../components/CalorieRing';
import { errorMessage } from '../lib/api';
import { formatDate, localDate, shiftDate, sumNutrition } from '../lib/nutrition';
import { meals, type Day, type Entry, type Meal } from '../lib/types';
import { useResource } from '../lib/useResource';

const mealAppearance = {
  Breakfast: { Icon: Coffee, color: colors.mint, background: '#193d4c' },
  Lunch: { Icon: Sun, color: colors.blue, background: '#1c3651' },
  Dinner: { Icon: Moon, color: colors.amber, background: '#453924' },
  Snacks: { Icon: Utensils, color: '#f38ba8', background: '#432b3a' },
};
const macros = [{ key: 'protein', label: 'Protein', color: colors.mint }, { key: 'carbs', label: 'Carbs', color: colors.blue }, { key: 'fat', label: 'Fat', color: colors.amber }] as const;

export function DiaryScreen({ date, onDate, onAdd, onGoals }: {
  date: string; onDate: (date: string) => void; onAdd: (meal: Meal) => void; onGoals: () => void;
}) {
  const { api } = useSession();
  const { desktop, wide, pageStyle } = useLayout();
  const [removing, setRemoving] = useState<Entry | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [writeError, setWriteError] = useState<string | null>(null);
  const deleteLock = useRef(false);
  const { data, error, loading, reload } = useResource<Day>(api, `/api/day?date=${date}`);
  const total = sumNutrition(data?.entries ?? []);
  const consumedPct = data?.goals.calories ? total.calories / data.goals.calories * 100 : 0;

  async function remove() {
    if (!removing || deleteLock.current) return;
    deleteLock.current = true; setDeleting(true); setWriteError(null);
    try {
      await api(`/api/entries?id=${encodeURIComponent(removing.id)}`, { method: 'DELETE' });
      setRemoving(null); reload();
    } catch (error) { setWriteError(errorMessage(error)); }
    finally { deleteLock.current = false; setDeleting(false); }
  }

  return <>
    <ScrollView contentContainerStyle={pageStyle} refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} tintColor={colors.mint} />}>
      {!isWeb && <View><Text style={styles.eyebrow}>DAILY DIARY</Text><Text style={styles.title}>Today’s fuel</Text><Text style={styles.muted}>A little awareness. A healthier every day.</Text></View>}
      <View style={[styles.row, { gap: 11 }]}>
        <Action secondary compact label="Previous day" style={{ minHeight: 36, paddingHorizontal: 8, borderWidth: 1, borderColor: colors.border }} onPress={() => onDate(shiftDate(date, -1))}><ChevronLeft color={colors.muted} size={18} /></Action>
        <View style={[styles.row, { minWidth: 148, justifyContent: 'center', gap: 9 }]}><CalendarDays color={colors.muted} size={18} /><Text testID="selected-date" style={[styles.body, { fontWeight: '700' }]}>{date === localDate() ? 'Today' : formatDate(date)}</Text></View>
        <Action secondary compact label="Next day" style={{ minHeight: 36, paddingHorizontal: 8, borderWidth: 1, borderColor: colors.border }} disabled={date >= localDate()} onPress={() => onDate(shiftDate(date, 1))}><ChevronRight color={colors.muted} size={18} /></Action>
      </View>
      {error && <ErrorNotice message={error} retry={reload} />}
      {writeError && !removing && <ErrorNotice message={writeError} />}
      {loading && <Loading />}
      {data && <>
        <View testID="energy-overview" style={{ backgroundColor: '#0f293a', borderWidth: 1, borderColor: '#264354', borderRadius: 24,
          padding: desktop ? 30 : 20, gap: wide ? 40 : 28, flexDirection: wide ? 'row' : 'column', alignItems: wide ? 'center' : 'stretch',
          ...(isWeb ? { boxShadow: '0 18px 55px #020b1144' } : {}) }}>
          <View style={[styles.row, { gap: desktop ? 26 : 18, ...(wide ? { flex: 1.1 } : {}) }]}>
            <CalorieRing consumed={total.calories} goal={data.goals.calories} size={desktop ? 154 : 112} />
            <View style={{ flex: 1, gap: 7 }}><Text style={styles.eyebrow}>DAILY ENERGY</Text>
              <Text style={[styles.heading, { fontSize: desktop ? 27 : 22 }]}>{Math.round(total.calories).toLocaleString()} <Text style={{ color: colors.muted, fontSize: 14 }}>of {Math.round(data.goals.calories).toLocaleString()} kcal</Text></Text>
              <Text style={styles.muted}>{consumedPct > 100 ? `${Math.round(total.calories - data.goals.calories)} calories over goal` : `${Math.round(consumedPct)}% of your calorie target logged`}</Text>
            </View>
          </View>
          <View style={{ gap: 22, ...(wide ? { flex: 1 } : {}) }}>
            {macros.map(({ key, label, color }) => <View key={key} style={{ gap: 9 }}>
              <View style={styles.between}><View style={[styles.row, { gap: 8 }]}><View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} /><Text style={[styles.body, { fontSize: 14 }]}>{label}</Text></View><Text style={[styles.body, { fontWeight: '600', fontSize: 14 }]}>{Math.round(total[key])} <Text style={styles.muted}>/ {Math.round(data.goals[key])}g</Text></Text></View>
              <Meter value={data.goals[key] ? total[key] / data.goals[key] * 100 : 0} color={color} label={`${label}: ${Math.round(total[key])} of ${Math.round(data.goals[key])} grams`} />
            </View>)}
          </View>
        </View>
        <View style={[styles.between, { marginTop: 12 }]}><View style={{ gap: 5 }}><Text style={styles.eyebrow}>MEALS</Text><Text accessibilityRole="header" style={[styles.heading, { fontSize: 23 }]}>Food diary</Text></View>
          <Action quiet secondary compact label="Edit goals" onPress={onGoals}><Target size={16} color={colors.muted} /><Text style={styles.muted}>Edit goals</Text></Action>
        </View>
        <View style={{ flexDirection: desktop ? 'row' : 'column', flexWrap: 'wrap', gap: 16 }}>
          {meals.map(name => {
            const items = data.entries.filter(entry => entry.meal === name);
            const { Icon, color, background } = mealAppearance[name];
            return <View key={name} testID={`meal-${name}`} style={{ ...(desktop ? { flexBasis: '47%', flexGrow: 1 } : { width: '100%' }), backgroundColor: '#0c2232', borderWidth: 1, borderColor: colors.border, borderRadius: 19, overflow: 'hidden' }}>
              <View style={[styles.between, { padding: 18, gap: 8 }]}>
                <View style={[styles.row, { flex: 1 }]}><View style={{ backgroundColor: background, padding: 11, borderRadius: 13 }}><Icon size={18} color={color} /></View><View style={{ flex: 1 }}><Text style={[styles.heading, { fontSize: 15 }]}>{name}</Text><Text style={[styles.muted, { fontSize: 12 }]}>{items.length ? `${items.length} item${items.length === 1 ? '' : 's'}` : 'Nothing logged yet'}</Text></View></View>
                <Text style={[styles.body, { fontWeight: '700' }]}>{Math.round(sumNutrition(items).calories)}</Text><Text style={{ color: colors.muted, fontSize: 11 }}>kcal</Text>
                <Action secondary compact label={`Add ${name}`} style={{ minHeight: 34, paddingHorizontal: 8, borderRadius: 9 }} onPress={() => onAdd(name)}><Plus size={17} color={colors.muted} /></Action>
              </View>
              {items.map(entry => <View key={entry.id} style={[styles.row, { paddingVertical: 13, paddingHorizontal: 14, gap: 10, borderTopWidth: 1, borderColor: colors.border }]}>
                <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#19394b', alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.mint, fontWeight: '800' }}>{entry.name.charAt(0)}</Text></View>
                <View style={{ flex: 1, minWidth: 0, gap: 3 }}><Text numberOfLines={1} style={{ color: colors.text, fontWeight: '600', fontSize: 13 }}>{entry.name}</Text><Text numberOfLines={1} style={{ color: colors.muted, fontSize: 11 }}>{entry.brand ? `${entry.brand} · ` : ''}{Math.round(entry.grams)} g · {entry.source}</Text></View>
                {wide && <View style={[styles.row, { gap: 8 }]}>{macros.map(({ key }) => <View key={key} style={{ alignItems: 'center' }}><Text style={{ color: colors.text, fontSize: 11 }}>{Math.round(entry[key])}g</Text><Text style={{ color: colors.muted, fontSize: 9 }}>{key[0].toUpperCase()}</Text></View>)}</View>}
                <Text style={{ color: colors.text, fontWeight: '700', fontSize: 13 }}>{Math.round(entry.calories)}</Text>
                <Action quiet secondary compact label={`Remove ${entry.name}`} style={{ paddingHorizontal: 4, minHeight: 34 }} onPress={() => { setWriteError(null); setRemoving(entry); }}><Trash2 color={colors.muted} size={15} /></Action>
              </View>)}
            </View>;
          })}
        </View>
      </>}
    </ScrollView>
    {removing && <AppDialog title="Remove food?" description={`Remove ${removing.name} from ${removing.meal.toLowerCase()}?`} onClose={() => setRemoving(null)} busy={deleting}>
      {writeError && <ErrorNotice message={writeError} />}
      <Action secondary disabled={deleting} onPress={() => setRemoving(null)}>Keep food</Action>
      <Action busy={deleting} onPress={() => void remove()}>Remove food</Action>
    </AppDialog>}
  </>;
}

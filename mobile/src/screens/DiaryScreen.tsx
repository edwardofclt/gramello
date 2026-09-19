import { useRef, useState } from 'react';
import { Alert, RefreshControl, ScrollView, Text, View } from 'react-native';
import { ChevronLeft, ChevronRight, Coffee, Moon, Plus, Sun, Trash2, Utensils } from 'lucide-react-native';
import { useSession } from '../auth/Session';
import { Action, Card, colors, ErrorNotice, Loading, Meter, styles } from '../components/ui';
import { CalorieRing } from '../components/CalorieRing';
import { errorMessage } from '../lib/api';
import { formatDate, localDate, shiftDate, sumNutrition } from '../lib/nutrition';
import { meals, type Day, type Entry, type Meal } from '../lib/types';
import { useResource } from '../lib/useResource';
import { FoodSheet } from './FoodSheet';

const mealIcons = { Breakfast: Coffee, Lunch: Sun, Dinner: Moon, Snacks: Utensils };
const macros = [{ key: 'protein', label: 'Protein', color: colors.mint }, { key: 'carbs', label: 'Carbs', color: colors.blue }, { key: 'fat', label: 'Fat', color: colors.amber }] as const;

export function DiaryScreen() {
  const { api } = useSession();
  const [date, setDate] = useState(localDate);
  const [meal, setMeal] = useState<Meal | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [writeError, setWriteError] = useState<string | null>(null);
  const deleteLock = useRef(false);
  const { data, error, loading, reload } = useResource<Day>(api, `/api/day?date=${date}`);
  const total = sumNutrition(data?.entries ?? []);

  function remove(entry: Entry) {
    Alert.alert('Remove food?', `Remove ${entry.name} from ${entry.meal.toLowerCase()}?`, [
      { text: 'Keep food', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => {
        if (deleteLock.current) return;
        deleteLock.current = true; setDeleting(entry.id); setWriteError(null);
        void api(`/api/entries?id=${encodeURIComponent(entry.id)}`, { method: 'DELETE' })
          .then(reload).catch(error => setWriteError(errorMessage(error)))
          .finally(() => { deleteLock.current = false; setDeleting(null); });
      } },
    ]);
  }

  return <>
    <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} tintColor={colors.mint} />}>
      <View><Text style={styles.eyebrow}>DAILY DIARY</Text><Text style={styles.title}>Today’s fuel</Text><Text style={styles.muted}>A little awareness. A healthier every day.</Text></View>
      <View style={styles.between}>
        <Action secondary compact label="Previous day" onPress={() => setDate(shiftDate(date, -1))}><ChevronLeft color={colors.text} size={20} /></Action>
        <View style={{ alignItems: 'center' }}><Text style={styles.heading}>{date === localDate() ? 'Today' : formatDate(date)}</Text><Text style={styles.muted}>{date === localDate() ? formatDate(date) : date}</Text></View>
        <Action secondary compact label="Next day" disabled={date >= localDate()} onPress={() => setDate(shiftDate(date, 1))}><ChevronRight color={colors.text} size={20} /></Action>
      </View>
      {error && <ErrorNotice message={error} retry={reload} />}
      {writeError && <ErrorNotice message={writeError} />}
      {loading && <Loading />}
      {data && <>
        <Card>
          <Text style={styles.eyebrow}>YOUR DAILY ENERGY</Text>
          <CalorieRing consumed={total.calories} goal={data.goals.calories} />
          <View style={{ alignItems: 'center', gap: 4 }}><Text style={styles.heading}>{Math.round(total.calories).toLocaleString()} <Text style={styles.muted}>/ {Math.round(data.goals.calories).toLocaleString()} kcal</Text></Text><Text style={styles.muted}>Nourish your day, one meal at a time.</Text></View>
          <View style={styles.divider} />
          {macros.map(({ key, label, color }) => <View key={key} style={{ gap: 9 }}>
            <View style={styles.between}><Text style={[styles.body, { color }]}>{label}</Text><Text style={styles.body}>{Math.round(total[key])}<Text style={styles.muted}> / {Math.round(data.goals[key])} g</Text></Text></View>
            <Meter value={data.goals[key] ? total[key] / data.goals[key] * 100 : 0} color={color} label={`${label}: ${Math.round(total[key])} of ${Math.round(data.goals[key])} grams`} />
          </View>)}
        </Card>
        <View style={styles.between}><Text style={styles.heading}>Food diary</Text><Text style={styles.muted}>{data.entries.length} items logged</Text></View>
        {meals.map(name => {
          const items = data.entries.filter(entry => entry.meal === name);
          const Icon = mealIcons[name];
          return <Card key={name}>
            <View style={styles.between}>
              <View style={[styles.row, { flex: 1 }]}><View style={{ backgroundColor: colors.raised, padding: 12, borderRadius: 14 }}><Icon size={21} color={colors.mint} /></View><View style={{ flex: 1 }}><Text style={styles.heading}>{name}</Text><Text style={styles.muted}>{items.length ? `${Math.round(sumNutrition(items).calories)} kcal` : 'Nothing logged yet'}</Text></View></View>
              <Action secondary compact label={`Add ${name}`} onPress={() => setMeal(name)}><Plus size={20} color={colors.mint} /></Action>
            </View>
            {items.map(entry => <View key={entry.id} style={{ gap: 12 }}>
              <View style={styles.divider} />
              <View style={styles.between}>
                <View style={{ flex: 1, gap: 3 }}><Text style={[styles.body, { fontWeight: '600' }]}>{entry.name}</Text><Text style={styles.muted}>{entry.brand ? `${entry.brand} · ` : ''}{Math.round(entry.grams)} g</Text><Text style={styles.muted}>{Math.round(entry.calories)} kcal · P {Math.round(entry.protein)} · C {Math.round(entry.carbs)} · F {Math.round(entry.fat)}</Text></View>
                <Action secondary compact label={`Remove ${entry.name}`} disabled={deleting !== null} busy={deleting === entry.id} onPress={() => remove(entry)}>{deleting === entry.id ? null : <Trash2 color={colors.muted} size={17} />}</Action>
              </View>
            </View>)}
          </Card>;
        })}
      </>}
    </ScrollView>
    {meal && <FoodSheet date={date} initialMeal={meal} onClose={() => setMeal(null)} onSaved={() => { setMeal(null); reload(); }} />}
  </>;
}

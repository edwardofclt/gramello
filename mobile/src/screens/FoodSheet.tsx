import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react-native';
import { useSession } from '../auth/Session';
import { Action, Card, colors, ErrorNotice, Field, styles } from '../components/ui';
import { errorMessage } from '../lib/api';
import { formatDate, scaleFood } from '../lib/nutrition';
import { meals, type Food, type Meal } from '../lib/types';

export function FoodSheet({ date, initialMeal, onClose, onSaved }: { date: string; initialMeal: Meal; onClose: () => void; onSaved: () => void }) {
  const { api } = useSession();
  const [meal, setMeal] = useState(initialMeal);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Food[]>([]);
  const [selected, setSelected] = useState<Food | null>(null);
  const [quantity, setQuantity] = useState('1');
  const [unit, setUnit] = useState<'serving' | 'grams'>('serving');
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [searchRevision, setSearchRevision] = useState(0);
  const saveLock = useRef(false);
  const scaled = selected ? scaleFood(selected, Number(quantity), unit) : null;

  useEffect(() => {
    if (query.trim().length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setSearching(true); setError(null);
      void api<{ foods: Food[] }>(`/api/foods/search?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal })
        .then(data => { if (!controller.signal.aborted) setResults(data.foods); })
        .catch(error => { if (!controller.signal.aborted) setError(errorMessage(error)); })
        .finally(() => { if (!controller.signal.aborted) setSearching(false); });
    }, 350);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [api, query, searchRevision]);

  async function save() {
    if (!selected || !scaled || saveLock.current) return;
    saveLock.current = true; setSaving(true); setError(null);
    try {
      await api('/api/entries', { method: 'POST', body: { date, meal, name: selected.name, brand: selected.brand, source: selected.source, sourceId: selected.id, quantity: Number(quantity), unit, ...scaled } });
      onSaved();
    } catch (error) { setError(errorMessage(error)); }
    finally { saveLock.current = false; setSaving(false); }
  }

  return <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { if (!saveLock.current) onClose(); }}>
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={[styles.between, { padding: 20, borderBottomWidth: 1, borderColor: colors.border }]}>
          <View><Text style={styles.heading}>{selected ? 'Choose amount' : 'Add food'}</Text><Text style={styles.muted}>{formatDate(date)}</Text></View>
          <Action secondary compact disabled={saving} label="Close food search" onPress={onClose}><X size={20} color={colors.text} /></Action>
        </View>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
          {error && <ErrorNotice message={error} retry={selected ? undefined : () => setSearchRevision(value => value + 1)} />}
          {!selected ? <>
            <Field label="Search foods" placeholder="Try oats, chicken, or a brand…" autoFocus autoCorrect={false} returnKeyType="search" value={query}
              onChangeText={value => { setQuery(value); setResults([]); setError(null); setSearching(value.trim().length >= 2); }} />
            <Text style={styles.muted}>USDA reference foods · Open Food Facts</Text>
            {searching ? <View style={styles.center}><ActivityIndicator color={colors.mint} /><Text style={styles.muted}>Searching food databases…</Text></View>
              : !results.length && !error ? <View style={styles.center}><Search size={36} color={colors.mint} /><Text style={styles.heading}>{query.trim().length < 2 ? 'Find your next bite' : 'No matches yet'}</Text><Text style={[styles.muted, { textAlign: 'center' }]}>{query.trim().length < 2 ? 'Search by food, brand, or product name.' : 'Try a shorter food name or another brand.'}</Text></View> : null}
            {results.map(food => <Action key={food.id} secondary onPress={() => { setSelected(food); setError(null); }}>
              <View style={[styles.between, { flex: 1, paddingVertical: 14 }]}>
                <View style={{ flex: 1, gap: 5 }}><Text style={[styles.body, { fontWeight: '600' }]}>{food.name}</Text><Text style={styles.muted}>{food.brand ? `${food.brand} · ` : ''}{food.source}</Text><Text style={styles.muted}>{Math.round(food.calories)} kcal per 100 g</Text></View><ChevronRight color={colors.muted} size={20} />
              </View>
            </Action>)}
          </> : <>
            <Action secondary disabled={saving} onPress={() => { setSelected(null); setError(null); }}><ChevronLeft size={18} color={colors.mint} /><Text style={styles.body}>Back to results</Text></Action>
            <Card><Text style={styles.heading}>{selected.name}</Text><Text style={styles.muted}>{selected.brand || selected.source} · {selected.servingLabel}</Text></Card>
            <Text style={styles.eyebrow}>ADD TO MEAL</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{meals.map(item => <Action key={item} compact secondary={meal !== item} disabled={saving} onPress={() => setMeal(item)}>{item}</Action>)}</View>
            <View style={styles.row}>{(['serving', 'grams'] as const).map(item => <View style={{ flex: 1 }} key={item}><Action secondary={unit !== item} disabled={saving} onPress={() => { setUnit(item); setQuantity(item === 'grams' ? String(selected.servingGrams) : '1'); }}>{item === 'grams' ? 'Grams' : 'Servings'}</Action></View>)}</View>
            <Field label={unit === 'grams' ? 'Weight in grams' : `Servings (${selected.servingLabel})`} value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" editable={!saving} selectTextOnFocus />
            <Card><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>{(['calories', 'protein', 'carbs', 'fat'] as const).map(key => <View style={{ width: '42%', gap: 4 }} key={key}><Text style={styles.title}>{scaled ? Math.round(scaled[key]) : '—'}<Text style={styles.muted}>{key === 'calories' ? ' kcal' : ' g'}</Text></Text><Text style={styles.muted}>{key[0].toUpperCase() + key.slice(1)}</Text></View>)}</View></Card>
            {!scaled && <Text style={styles.muted}>Enter an amount greater than zero.</Text>}
            <Action busy={saving} disabled={!scaled} onPress={() => void save()}>{`Add to ${meal.toLowerCase()}`}</Action>
          </>}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  </Modal>;
}

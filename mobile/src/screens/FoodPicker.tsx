import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Linking, Pressable, Text, View } from 'react-native';
import { ChevronLeft, ChevronRight, Minus, Plus, ScanBarcode, Search } from 'lucide-react-native';
import { useSession } from '../diary/Session';
import { Action, Card, colors, ErrorNotice, Field, styles, useLayout } from '../components/ui';
import { BarcodeScanner } from '../components/BarcodeScanner';
import { CustomFoodForm } from '../components/CustomFoodForm';
import { FoodVerification } from '../components/FoodVerification';
import { nutritionLabel } from '../../../lib/food';
import type { FoodSearchIssue, FoodSearchResult } from '../../../lib/food-search';
import { errorMessage } from '../lib/api';
import { scaleFood } from '../lib/nutrition';
import { meals, type Food, type Meal } from '../lib/types';
import { foodUnits, servingQuantity, unitLabels, amountLabels, type AmountUnit, type Ingredient } from '../../../lib/meals';

export function FoodPicker({ date, initialMeal, onSaved, initialFood, onIngredient, onBusy, onTitle }: { date: string; initialMeal: Meal; onSaved: () => void; initialFood?: Food; onIngredient?: (ingredient: Ingredient) => void; onBusy?: (busy: boolean) => void; onTitle?: (title: string) => void }) {
  const { api, local } = useSession();
  const { width } = useLayout();
  const [meal, setMeal] = useState(initialMeal);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Food[]>([]);
  const [selected, setSelected] = useState<Food | null>(initialFood ?? null);
  const [scanning, setScanning] = useState(false);
  const [custom, setCustom] = useState(false);
  const [partial, setPartial] = useState(false);
  const [issues, setIssues] = useState<FoodSearchIssue[]>([]);
  const [showSearchDetails, setShowSearchDetails] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [quantity, setQuantity] = useState('1');
  const [unit, setUnit] = useState<AmountUnit>('serving');
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [searchRevision, setSearchRevision] = useState(0);
  const saveLock = useRef(false);
  const scaled = selected ? scaleFood(selected, Number(quantity), unit) : null;
  useEffect(() => { onTitle?.(selected ? 'Choose amount' : custom ? 'Add custom food' : scanning ? 'Scan barcode' : 'Add food'); }, [selected, scanning, custom, onTitle]);
  const lookupBarcode = useCallback(async (code: string, signal: AbortSignal) => {
    const result = await api<{ food: Food }>(`/api/foods/barcode?code=${encodeURIComponent(code)}`, { signal });
    return result.food;
  }, [api]);
  const selectFood = useCallback((food: Food) => {
    setSelected(food); setScanning(false); setCustom(false); setQuantity('1'); setUnit('serving'); setError(null);
  }, []);

  useEffect(() => {
    if (custom || scanning || selected || query.trim().length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setSearching(true); setError(null);
      void api<FoodSearchResult>(`/api/foods/search?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal })
        .then(data => { if (!controller.signal.aborted) { setResults(data.foods); setPartial(!!data.partial); setIssues(data.issues ?? []); setHasMore(!!data.hasMore); } })
        .catch(error => { if (!controller.signal.aborted) setError(errorMessage(error)); })
        .finally(() => { if (!controller.signal.aborted) setSearching(false); });
    }, 350);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [api, query, searchRevision, scanning, selected, custom]);

  async function save() {
    if (!selected || !scaled || saveLock.current) return;
    if (onIngredient) { onIngredient({ food: selected, quantity: Number(quantity), unit }); return; }
    saveLock.current = true; setSaving(true); onBusy?.(true); setError(null);
    try {
      await api('/api/entries', { method: 'POST', body: { date, meal, name: selected.name, brand: selected.brand, source: selected.source, sourceId: selected.id, quantity: Number(quantity), unit, ...scaled } });
      onSaved();
    } catch (error) { setError(errorMessage(error)); }
    finally { saveLock.current = false; setSaving(false); onBusy?.(false); }
  }

  return <>
          {error && <ErrorNotice message={error} retry={selected ? undefined : () => setSearchRevision(value => value + 1)} />}
          {custom ? <CustomFoodForm initialName={query} api={api} onSaved={selectFood} onBack={() => setCustom(false)} onBusy={busy => { setSaving(busy); onBusy?.(busy); }}/>
            : scanning ? <BarcodeScanner lookup={lookupBarcode} onFound={selectFood} onBack={() => { setScanning(false); setSearching(false); }} /> : !selected ? <>
            <Field label="Search foods" placeholder="Try oats, chicken, or a brand…" autoFocus autoCorrect={false} returnKeyType="search" value={query}
              onChangeText={value => { setQuery(value); setResults([]); setError(null); setPartial(false); setIssues([]); setShowSearchDetails(false); setHasMore(false); setSearching(value.trim().length >= 2); }} />
            <Action secondary label="Scan barcode" onPress={() => { setScanning(true); setSearching(false); setError(null); }}><ScanBarcode size={20} color={colors.mint} /><Text style={styles.body}>Scan barcode</Text></Action>
            <Action secondary onPress={() => { setCustom(true); setSearching(false); setError(null); }}>Add custom food</Action>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>{(local ? ['Restaurant menus', 'Downloaded foods', 'Saved lookups', 'Open Food Facts', 'My foods'] : ['Restaurant menus', 'USDA', 'Open Food Facts', 'Community foods']).map(source => <Text key={source} style={{ color: colors.muted, fontSize: 11, backgroundColor: colors.raised, borderRadius: 20, paddingVertical: 5, paddingHorizontal: 9 }}>{source}</Text>)}</View>
            {local && <Text style={styles.muted}>Searches automatically include Open Food Facts. Online results are saved for offline use.</Text>}
            {partial && <View accessibilityLiveRegion="polite" style={{ gap: 8 }}>
              <Pressable accessibilityRole="button" accessibilityLabel="Some nutrition databases are unavailable." accessibilityHint="Show or hide database details" aria-expanded={showSearchDetails} onPress={() => setShowSearchDetails(value => !value)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48 }}>
                <View style={{ flex: 1, gap: 3 }}><Text style={{ color: colors.amber, fontSize: 12 }}>Some nutrition databases are unavailable.</Text><Text style={{ color: colors.amber, fontSize: 11, textDecorationLine: 'underline' }}>{showSearchDetails ? 'Hide details' : 'Show details'}</Text></View>
                <ChevronRight color={colors.amber} size={18} style={{ transform: [{ rotate: showSearchDetails ? '90deg' : '0deg' }] }} />
              </Pressable>
              {showSearchDetails && <View style={{ gap: 8, padding: 12, borderRadius: 12, backgroundColor: colors.raised }}>
                {issues.length ? issues.map(issue => <Text key={issue.source} style={styles.muted}><Text style={{ color: colors.amber, fontWeight: '600' }}>{issue.source}: </Text>{issue.message}</Text>) : <Text style={styles.muted}>The search service did not provide details about which databases failed. Try searching again.</Text>}
                <Text style={styles.muted}>Showing available matches from the catalog and other sources. You can still choose a result or add a custom food.</Text>
              </View>}
            </View>}
            {searching ? <View style={styles.center}><ActivityIndicator color={colors.mint} /><Text style={styles.muted}>Searching food databases…</Text></View>
              : !results.length && !error ? <View style={styles.center}><Search size={36} color={colors.mint} /><Text style={styles.heading}>{query.trim().length < 2 ? 'Find your next bite' : 'No matches yet'}</Text><Text style={[styles.muted, { textAlign: 'center' }]}>{query.trim().length < 2 ? 'Search by food, brand, or product name.' : 'Try another name, or add a custom food above.'}</Text></View> : null}
            {results.map(food => <Action key={food.id} quiet secondary style={{ paddingHorizontal: 0, justifyContent: 'flex-start', borderBottomWidth: 1, borderColor: colors.border }} onPress={() => selectFood(food)}>
              <View style={[styles.between, { flex: 1, paddingVertical: 12 }]}>
                <FoodThumbnail food={food} />
                <View style={{ flex: 1, gap: 5 }}><Text style={[styles.body, { fontWeight: '600' }]}>{food.name}</Text><Text style={styles.muted}>{food.brand ? `${food.brand} · ` : ''}{food.source}</Text><FoodVerification verified={food.verified}/><Text style={[styles.muted, { fontSize: 11 }]}>{Math.round(food.calories)} kcal · P {Math.round(food.protein)}g · C {Math.round(food.carbs)}g · F {Math.round(food.fat)}g {nutritionLabel(food)}</Text></View><ChevronRight color={colors.muted} size={18} />
              </View>
            </Action>)}
            {hasMore && <Text style={styles.muted}>Showing the first 100 matches. Add an item name to narrow your search.</Text>}
          </> : <>
            <Action quiet secondary style={{ justifyContent: 'flex-start', paddingHorizontal: 0 }} disabled={saving} onPress={() => { setSelected(null); setError(null); }}><ChevronLeft size={18} color={colors.muted} /><Text style={styles.muted}>Back to results</Text></Action>
            <Card style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.background, borderWidth: 0, padding: 15 }}><FoodThumbnail food={selected} /><View style={{ flex: 1, gap: 4 }}><Text style={styles.heading}>{selected.name}</Text><Text style={styles.muted}>{selected.brand || selected.source} · {selected.servingLabel}</Text><FoodVerification verified={selected.verified}/>{selected.sourceUrl && <Text accessibilityRole="link" style={{ color: colors.blue, textDecorationLine: 'underline', fontSize: 12 }} onPress={() => { void Linking.openURL(selected.sourceUrl!).catch(() => setError('Could not open the nutrition source.')); }}>View nutrition source</Text>}</View></Card>
            {!onIngredient && <><Text style={styles.eyebrow}>ADD TO MEAL</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{meals.map(item => <Action key={item} compact secondary={meal !== item} disabled={saving} onPress={() => setMeal(item)}>{item}</Action>)}</View></>}
            <View style={styles.row}>{foodUnits(selected).map(item => <View style={{ flex: 1 }} key={item}><Action secondary={unit !== item} disabled={saving} onPress={() => { setUnit(item); setQuantity(String(servingQuantity(selected, item))); }}>{unitLabels[item]}</Action></View>)}</View>
            <View style={[styles.row, { alignItems: 'flex-end' }]}>
              <Action secondary compact disabled={saving} label="Decrease amount" onPress={() => setQuantity(String(Math.max((unit === 'grams' || unit === 'milliliters') ? 1 : .25, (Number(quantity) || 0) - ((unit === 'grams' || unit === 'milliliters') ? 5 : .25))))}><Minus size={18} color={colors.muted} /></Action>
              <View style={{ flex: 1 }}><Field label={unit === 'serving' ? `Servings (${selected.servingLabel})` : amountLabels[unit]} value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" editable={!saving} selectTextOnFocus /></View>
              <Action secondary compact disabled={saving} label="Increase amount" onPress={() => setQuantity(String((Number(quantity) || 0) + ((unit === 'grams' || unit === 'milliliters') ? 5 : .25)))}><Plus size={18} color={colors.muted} /></Action>
            </View>
            {unit === 'ounces' && <Text style={styles.muted}>Ounces by weight, not fluid ounces.</Text>}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{(['calories', 'protein', 'carbs', 'fat'] as const).map(key => <View style={{ flexGrow: 1, flexBasis: width > 550 ? '22%' : '46%', gap: 4, alignItems: 'center', backgroundColor: colors.raised, padding: 12, borderRadius: 12 }} key={key}><Text style={[styles.heading, { fontSize: 20 }]}>{scaled ? Math.round(scaled[key]) : '—'}{key !== 'calories' ? 'g' : ''}</Text><Text style={styles.muted}>{key}</Text></View>)}</View>
            {!scaled && <Text style={styles.muted}>Enter an amount greater than zero.</Text>}
            <Action busy={saving} disabled={!scaled} onPress={() => void save()}>{onIngredient ? 'Add ingredient' : `Add to ${meal.toLowerCase()}`}</Action>
          </>}
  </>;
}

function FoodThumbnail({ food }: { food: Food }) {
  const [failed, setFailed] = useState(false);
  return food.image && !failed ? <Image source={{ uri: food.image }} alt="" accessibilityIgnoresInvertColors onError={() => setFailed(true)} style={{ width: 52, height: 52, borderRadius: 12 }} />
    : <View style={{ width: 52, height: 52, borderRadius: 12, backgroundColor: '#19394b', alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.mint, fontSize: 20, fontWeight: '800' }}>{food.name.charAt(0)}</Text></View>;
}

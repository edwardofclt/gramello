import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Linking, Pressable, Text, View } from 'react-native';
import { ChevronLeft, ChevronRight, Minus, Plus, ScanBarcode, Search } from 'lucide-react-native';
import { useSession } from '../diary/Session';
import { Action, Card, colors, ErrorNotice, Field, styles, useLayout } from '../components/ui';
import { BarcodeScanner } from '../components/BarcodeScanner';
import { CustomFoodForm } from '../components/CustomFoodForm';
import { useDialogScroll } from '../components/AppDialog';
import { FoodVerification } from '../components/FoodVerification';
import { ServingPicker } from '../components/ServingPicker';
import { foodRevision } from '../../../lib/food-revision';
import { nutritionLabel } from '../../../lib/food';
import { groupSearchHits, searchCategories, searchHits, useFoodSearch } from '../../../hooks/use-food-search';
import type { FoodSearchHit } from '../../../lib/food-search';
import { errorMessage } from '../lib/api';
import { scaleFood } from '../lib/nutrition';
import { meals, type Food, type Meal } from '../lib/types';
import { foodUnits, convertFoodQuantity, displayAmount, unitLabels, amountLabels, type AmountUnit, type Ingredient } from '../../../lib/meals';

export function FoodPicker({ date, initialMeal, onSaved, initialFood, onIngredient, onBusy, onTitle }: { date: string; initialMeal: Meal; onSaved: () => void; initialFood?: Food; onIngredient?: (ingredient: Ingredient) => void; onBusy?: (busy: boolean) => void; onTitle?: (title: string) => void }) {
  const { api, local } = useSession();
  const { width } = useLayout();
  const dialogScroll = useDialogScroll();
  const resultScroll = useRef(0);
  const refreshOnBack = useRef(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [meal, setMeal] = useState(initialMeal);
  const search = useFoodSearch(api);
  const { query, setQuery, results: searchResult, busy: searching, pause } = search;
  const { partial, issues = [] } = searchResult;
  const [selected, setSelected] = useState<Food | null>(initialFood ?? null);
  const [scanning, setScanning] = useState(false);
  const [custom, setCustom] = useState(false);

  const [showSearchDetails, setShowSearchDetails] = useState(false);

  const [quantity, setQuantity] = useState('1');
  const [unit, setUnit] = useState<AmountUnit>('serving');

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const saveLock = useRef(false);
  const scaled = selected ? scaleFood(selected, Number(quantity), unit) : null;
  useEffect(() => { onTitle?.(selected ? 'Choose amount' : custom ? 'Add custom food' : scanning ? 'Scan barcode' : 'Add food'); }, [selected, scanning, custom, onTitle]);
  const lookupBarcode = useCallback(async (code: string, signal: AbortSignal) => {
    const result = await api<{ food: Food }>(`/api/foods/barcode?code=${encodeURIComponent(code)}`, { signal });
    return result.food;
  }, [api]);
  const selectFood = useCallback((food: Food) => {
    pause();
    if (!scanning && !custom) resultScroll.current = dialogScroll?.capture() ?? 0;
    dialogScroll?.showTop();
    setSelected(food); setScanning(false); setCustom(false); setQuantity('1'); setUnit('serving'); setError(null);
  }, [dialogScroll, scanning, custom, pause]);
  const leaveSearch = () => { search.pause(); resultScroll.current = dialogScroll?.capture() ?? 0; dialogScroll?.showTop(); };
  const returnToResults = () => { dialogScroll?.restore(resultScroll.current); };

  async function save() {
    if (!selected || !scaled || saveLock.current) return;
    if (onIngredient) { onIngredient({ food: selected, quantity: Number(quantity), unit }); return; }
    saveLock.current = true; setSaving(true); onBusy?.(true); setError(null);
    try {
      await api('/api/entries', { method: 'POST', body: { date, meal, name: selected.name, brand: selected.brand, source: selected.source, sourceId: selected.id, servingId: selected.selectedServingId, ...(selected.sourceKind ? { foodRevision: foodRevision(selected) } : {}), quantity: Number(quantity), unit, ...scaled } });
      onSaved();
    } catch (error) { setError(errorMessage(error)); }
    finally { saveLock.current = false; setSaving(false); onBusy?.(false); }
  }

  return <>
          {error && <ErrorNotice message={error} />}
          {custom ? <CustomFoodForm initialName={query} api={api} onSaved={food => { refreshOnBack.current = true; selectFood(food); }} onBack={() => { returnToResults(); setCustom(false); }} onBusy={busy => { setSaving(busy); onBusy?.(busy); }}/>
            : scanning ? <BarcodeScanner lookup={lookupBarcode} onFound={food => { refreshOnBack.current = true; selectFood(food); }} onBack={() => { returnToResults(); setScanning(false); }} /> : !selected ? <>
            <Field label="Search foods" placeholder="Try oats, chicken, or a brand…" autoFocus={!query} autoCorrect={false} returnKeyType="search" maxLength={200} value={query}
              onSubmitEditing={search.submitSearch} onChangeText={value => { setQuery(value); setError(null); setShowSearchDetails(false); }} />
            <Action secondary label="Scan barcode" onPress={() => { leaveSearch(); setScanning(true); setError(null); }}><ScanBarcode size={20} color={colors.mint} /><Text style={styles.body}>Scan barcode</Text></Action>
            <Action secondary onPress={() => { leaveSearch(); setCustom(true); setError(null); }}>Add custom food</Action>
            <View accessibilityLabel="Food categories" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>{searchCategories.map(([value, label]) => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: search.category === value }} aria-pressed={search.category === value} onPress={() => search.setCategory(value)} style={{ minHeight: 44, paddingHorizontal: 12, justifyContent: 'center', borderRadius: 20, backgroundColor: search.category === value ? '#235b57' : colors.raised }}><Text style={{ color: search.category === value ? colors.mint : colors.muted, fontSize: 12 }}>{label === 'Custom' ? local ? 'My foods' : 'Community foods' : label}</Text></Pressable>)}</View>
            {(search.brand || !!searchResult.brands?.length) && <><Text style={styles.eyebrow}>BRAND OR RESTAURANT</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>{['', ...Array.from(new Set([...(searchResult.brands ?? []), ...(search.brand ? [search.brand] : [])]))].map(brand => <Pressable key={brand} accessibilityRole="button" accessibilityState={{ selected: search.brand === brand }} aria-pressed={search.brand === brand} onPress={() => search.setBrand(brand)} style={{ minHeight: 44, paddingHorizontal: 12, justifyContent: 'center', borderRadius: 20, backgroundColor: search.brand === brand ? '#235b57' : colors.raised }}><Text style={{ color: search.brand === brand ? colors.mint : colors.muted, fontSize: 12 }}>{brand || 'All brands and restaurants'}</Text></Pressable>)}</View></>}
            {(search.category !== 'all' || search.brand) && <Action quiet secondary onPress={search.clearFilters}>Clear filters</Action>}
            {searchResult.correction && <View><Text style={styles.muted}>Also searching for “{searchResult.correction}”.</Text><Action quiet secondary onPress={() => setQuery(searchResult.correction!)}>Use this spelling</Action></View>}
            {search.error && <ErrorNotice message={search.error} retry={search.retry} />}
            {search.notice && <Text accessibilityLiveRegion="polite" style={styles.muted}>{search.notice}</Text>}
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
            {searchResult.sourceStatus?.filter(status => status.message && (status.state !== 'unavailable' || !issues.some(issue => issue.source === status.source))).map(status => <Text key={status.source} accessibilityLiveRegion="polite" style={styles.muted}>{status.source}: {status.message}</Text>)}
            {searching && <View accessibilityLiveRegion="polite" style={styles.center}><ActivityIndicator color={colors.mint} /><Text style={styles.muted}>Finding more matches…</Text></View>}
            {!searchResult.foods.length && !searching && <View style={styles.center}><Search size={36} color={colors.mint} /><Text style={styles.heading}>{!search.validQuery ? 'Find your next bite' : search.category !== 'all' || search.brand ? 'No matches with these filters' : 'No matches yet'}</Text><Text style={[styles.muted, { textAlign: 'center' }]}>{!search.validQuery ? 'Enter at least two characters. Search by food, brand, or product name.' : 'Try a shorter name, check the spelling, or add a custom food.'}</Text></View>}
            <FoodSearchRows hits={searchHits(searchResult)} onChoose={selectFood} expanded={expandedGroups} onExpand={key => setExpandedGroups(previous => ({ ...previous, [key]: !previous[key] }))} />
            {searchResult.nextCursor && <Action secondary busy={searching === 'more'} disabled={searching === 'local' || searching === 'more'} onPress={() => void search.loadMore()}>Load more</Action>}
            {!searchResult.nextCursor && search.canExpand && <Action secondary busy={searching === 'more'} disabled={searching === 'local' || searching === 'more'} onPress={() => void search.findMore()}>Find more matches</Action>}
            {!searchResult.nextCursor && searchResult.hasMore && !search.canExpand && <Text style={styles.muted}>Refine your search by preparation, brand, or restaurant for more precise matches.</Text>}
          </> : <>
            <Action quiet secondary style={{ justifyContent: 'flex-start', paddingHorizontal: 0 }} disabled={saving} onPress={() => { if (error?.startsWith('This food changed')) resultScroll.current = 0; if (refreshOnBack.current || error?.startsWith('This food changed')) { refreshOnBack.current = false; search.retry(); } returnToResults(); setSelected(null); setError(null); }}><ChevronLeft size={18} color={colors.muted} /><Text style={styles.muted}>{error?.startsWith('This food changed') ? 'Back and refresh results' : 'Back to results'}</Text></Action>
            <Card style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.background, borderWidth: 0, padding: 15 }}><FoodThumbnail food={selected} /><View style={{ flex: 1, gap: 4 }}><Text style={styles.heading}>{selected.name}</Text><Text style={styles.muted}>{selected.brand || selected.source} · {selected.servingLabel}</Text><FoodVerification verified={selected.verified}/>{selected.sourceUrl && <Text accessibilityRole="link" style={{ color: colors.blue, textDecorationLine: 'underline', fontSize: 12 }} onPress={() => { void Linking.openURL(selected.sourceUrl!).catch(() => setError('Could not open the nutrition source.')); }}>View nutrition source</Text>}</View></Card>
            {!onIngredient && <><Text style={styles.eyebrow}>ADD TO MEAL</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{meals.map(item => <Action key={item} compact secondary={meal !== item} disabled={saving} onPress={() => setMeal(item)}>{item}</Action>)}</View></>}
            <View style={styles.row}>{foodUnits(selected).map(item => <View style={{ flex: 1 }} key={item}><Action secondary={unit !== item} disabled={saving} onPress={() => { setQuantity(String(convertFoodQuantity(selected, Number(quantity), unit, item))); setUnit(item); }}>{unitLabels[item]}</Action></View>)}</View>
            {unit === 'serving' && <ServingPicker food={selected} disabled={saving} onChange={food => { setSelected(food); setError(null); }} />}
            <View style={[styles.row, { alignItems: 'flex-end' }]}>
              <Action secondary compact disabled={saving} label="Decrease amount" onPress={() => setQuantity(String(Math.max((unit === 'grams' || unit === 'milliliters') ? 1 : .25, (Number(quantity) || 0) - ((unit === 'grams' || unit === 'milliliters') ? 5 : .25))))}><Minus size={18} color={colors.muted} /></Action>
              <View style={{ flex: 1 }}><Field label={unit === 'serving' ? `Servings (${selected.servingLabel})` : amountLabels[unit]} value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" editable={!saving} selectTextOnFocus /></View>
              <Action secondary compact disabled={saving} label="Increase amount" onPress={() => setQuantity(String((Number(quantity) || 0) + ((unit === 'grams' || unit === 'milliliters') ? 5 : .25)))}><Plus size={18} color={colors.muted} /></Action>
            </View>
            {unit === 'ounces' && <Text style={styles.muted}>Ounces by weight, not fluid ounces.</Text>}
            {unit === 'serving' && scaled && <Text style={styles.muted} accessibilityLiveRegion="polite">{displayAmount(Number(quantity))} × {selected.servingLabel}{scaled.grams !== null ? ` = ${displayAmount(scaled.grams)} g total` : selected.servingMl ? ` = ${displayAmount(Number(quantity) * selected.servingMl)} mL total` : ''}</Text>}
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

function FoodSearchRows({ hits, onChoose, expanded, onExpand }: { hits: FoodSearchHit[]; onChoose: (food: Food) => void; expanded: Record<string, boolean>; onExpand: (key: string) => void }) {
  const row = (hit: FoodSearchHit) => { const food = hit.food; return <Action key={food.id} quiet secondary style={{ paddingHorizontal: 0, justifyContent: 'flex-start', borderBottomWidth: 1, borderColor: colors.border }} onPress={() => onChoose(food)}><View style={[styles.between, { flex: 1, paddingVertical: 12 }]}><FoodThumbnail food={food} /><View style={{ flex: 1, gap: 5 }}><Text style={[styles.body, { fontWeight: '600' }]}>{food.name}</Text><Text style={styles.muted}>{food.brand ? `${food.brand} · ` : ''}{food.source}</Text><Text style={styles.muted}>Serving: {food.servingLabel}</Text><FoodVerification verified={food.verified}/><Text style={[styles.muted, { fontSize: 11 }]}>{Math.round(food.calories)} kcal · P {Math.round(food.protein)}g · C {Math.round(food.carbs)}g · F {Math.round(food.fat)}g {nutritionLabel(food)}</Text>{hit.warning && <Text style={{ color: colors.amber, fontSize: 12 }}>{hit.warning}</Text>}</View><ChevronRight color={colors.muted} size={18} /></View></Action>; };
  return <>{groupSearchHits(hits).map(group => group.hits.length > 1 ? <View key={group.key}><Pressable accessibilityRole="button" aria-expanded={!!expanded[group.key]} onPress={() => onExpand(group.key)} style={{ minHeight: 48, justifyContent: 'center' }}><Text style={styles.body}>{group.label ?? group.hits[0].food.name} · {group.hits.length} variants — choose preparation or size</Text></Pressable>{expanded[group.key] && group.hits.map(row)}</View> : row(group.hits[0]))}</>;
}

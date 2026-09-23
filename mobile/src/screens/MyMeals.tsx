import { unitHint } from '../../../lib/meals';
import { useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useSession } from '../diary/Session';
import { Action, Card, colors, ErrorNotice, Field, isWeb, styles } from '../components/ui';
import { FoodPicker } from './FoodPicker';
import { useMealDraft } from '../../../hooks/use-meal-draft';
import { useMealLibrary } from '../../../hooks/use-meal-library';
import { displayAmount, GRAMS_PER_OUNCE, mealFood, nutrientKeys, scaleFood, summarizeMeal, type CustomMeal, type Food } from '../../../lib/meals';
import type { Meal } from '../lib/types';

export function MyMeals({ date, initialMeal, onChoose, onBusy }: { date: string; initialMeal: Meal; onChoose: (food: Food) => void; onBusy: (busy: boolean) => void }) {
  const { api } = useSession();
  const library = useMealLibrary(api);
  const [editing, setEditing] = useState<CustomMeal | 'new' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [notice, setNotice] = useState('');
  if (editing) return <MealEditor date={date} initialMeal={initialMeal} initial={editing === 'new' ? undefined : editing} onBusy={onBusy} onBack={() => setEditing(null)} onSaved={() => { setEditing(null); library.reload(); setNotice('Meal saved. Choose it below to log any portion.'); }} />;
  return <>
    <Action onPress={() => { setNotice(''); setEditing('new'); }}>Create meal</Action>
    <Text style={styles.muted}>Combine ingredients once, then log any portion. {isWeb ? 'Your meals are saved in this browser’s diary.' : 'Your meals are saved on this device.'}</Text>
    {!!notice && <Text accessibilityRole="alert" style={styles.body}>{notice}</Text>}
    <Field label="Search my meals" value={filter} onChangeText={setFilter} placeholder="Search my meals…" />
    {library.error && <ErrorNotice message={library.error} retry={library.reload} />}
    {library.loading ? <ActivityIndicator color={colors.mint} /> : library.meals.length === 0 ? <View style={styles.center}><Text style={styles.heading}>Your recipes, ready to reuse</Text><Text style={styles.muted}>Create your first meal from foods you already use.</Text></View> : library.meals.filter(meal => meal.name.toLowerCase().includes(filter.toLowerCase())).map(meal => {
      const summary = summarizeMeal(meal);
      return <Card key={meal.id}>
        <Action quiet secondary label={`Choose ${meal.name}`} disabled={library.deleting} style={{ paddingHorizontal: 0, justifyContent: 'flex-start' }} onPress={() => onChoose(mealFood(meal))}><View style={{ flex: 1, gap: 6 }}><Text style={[styles.heading, { color: colors.mint }]}>{meal.name}</Text><Text style={styles.muted}>{meal.ingredients.length} ingredients · {Math.round(summary.totals.calories)} kcal per batch</Text><Text style={styles.muted}>{displayAmount(summary.servings)} portions · {Math.round(summary.portion.calories)} kcal each</Text></View></Action>
        <View style={[styles.row, { flexWrap: 'wrap' }]}><Action secondary disabled={library.deleting} onPress={() => { setNotice(''); setEditing(meal); }}>{`Edit ${meal.name}`}</Action><Action secondary disabled={library.deleting} label={`Delete ${meal.name}`} onPress={() => setConfirmDelete(meal.id)}>Delete</Action></View>
        {confirmDelete === meal.id && <><Text style={styles.muted}>Delete this saved meal? Previously logged portions stay in your diary.</Text><View style={styles.row}><Action secondary busy={library.deleting} onPress={async () => { onBusy(true); try { if (await library.remove(meal.id)) setConfirmDelete(null); } finally { onBusy(false); } }}>Delete meal</Action><Action secondary disabled={library.deleting} onPress={() => setConfirmDelete(null)}>Keep meal</Action></View></>}
      </Card>;
    })}
  </>;
}

function MealEditor({ date, initialMeal, initial, onSaved, onBack, onBusy }: { date: string; initialMeal: Meal; initial?: CustomMeal; onSaved: () => void; onBack: () => void; onBusy: (busy: boolean) => void }) {
  const { api } = useSession();
  const draft = useMealDraft(initial);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lock = useRef(false);
  async function save() {
    if (!draft.valid || !draft.input || lock.current) return;
    lock.current = true; setSaving(true); onBusy(true); setError(null);
    try { await api(`/api/meals${initial ? `?id=${encodeURIComponent(initial.id)}` : ''}`, { method: initial ? 'PUT' : 'POST', body: draft.input }); onSaved(); }
    catch (error) { setError(error instanceof Error ? error.message : 'Meal could not be saved.'); }
    finally { lock.current = false; setSaving(false); onBusy(false); }
  }
  if (adding) return <><Action quiet secondary disabled={saving} onPress={() => setAdding(false)}>Back to meal</Action><Text style={styles.heading}>Add ingredient</Text><FoodPicker date={date} initialMeal={initialMeal} onSaved={() => {}} onBusy={busy => { setSaving(busy); onBusy(busy); }} onIngredient={ingredient => { draft.setIngredients(items => [...items, ingredient]); setAdding(false); }} /></>;
  const summary = draft.summary;
  const requiresWeight = draft.ingredients.some(item => scaleFood(item.food, item.quantity, item.unit)?.grams == null);
  return <>
    <Action quiet secondary disabled={saving} onPress={onBack}>Back to my meals</Action>
    <Text style={styles.heading}>{initial ? 'Edit meal' : 'Create meal'}</Text>
    <Field label="Meal name" value={draft.name} maxLength={150} editable={!saving} onChangeText={draft.setName} placeholder="Beef & vegetable soup" />
    <Text style={styles.eyebrow}>INGREDIENTS</Text>
    {draft.ingredients.map((ingredient, index) => <Card key={index}>
      <Text style={styles.body}>{ingredient.food.name}</Text>
      <Field label={`Amount of ${ingredient.food.name}`} hint={ingredient.unit === 'serving' ? ingredient.food.servingLabel : unitHint(ingredient.unit)} keyboardType="decimal-pad" value={ingredient.amountText ?? String(ingredient.quantity)} editable={!saving} onChangeText={value => draft.setIngredients(items => items.map((item, i) => i === index ? { ...item, quantity: Number(value), amountText: value } : item))} />
      <Action secondary label={`Remove ingredient ${ingredient.food.name}`} disabled={saving} onPress={() => draft.setIngredients(items => items.filter((_, i) => i !== index))}>Remove ingredient</Action>
    </Card>)}
    <Action secondary disabled={saving || draft.ingredients.length >= 100} onPress={() => setAdding(true)}>Add ingredient</Action>
    <Text style={styles.eyebrow}>BATCH WEIGHT</Text>
    {!requiresWeight && <Text style={styles.muted}>Estimated from ingredients: {displayAmount(draft.estimatedGrams)} g ({displayAmount(draft.estimatedGrams / GRAMS_PER_OUNCE)} oz). For more accurate portions, weigh the finished meal without its container. Cooking can change the weight.</Text>}
    <Field label={`Finished batch weight (${requiresWeight ? 'required' : 'optional'})`} value={draft.weight} onChangeText={draft.setWeight} keyboardType="decimal-pad" placeholder={requiresWeight ? "Enter measured weight" : "Use ingredient estimate"} editable={!saving} />
    {requiresWeight && <Text style={styles.muted}>Enter the finished batch weight when an ingredient is measured by volume or has no known weight.</Text>}
    <View style={styles.row}>{(['grams', 'ounces'] as const).map(unit => <Action key={unit} secondary={draft.weightUnit !== unit} disabled={saving} label={`Batch weight in ${unit}`} onPress={() => { if (draft.weight.trim() && unit !== draft.weightUnit) draft.setWeight(String(Number(draft.weight) * (unit === 'ounces' ? 1 / GRAMS_PER_OUNCE : GRAMS_PER_OUNCE))); draft.setWeightUnit(unit); }}>{unit === 'grams' ? 'Grams' : 'Ounces'}</Action>)}</View>
    <Text style={styles.eyebrow}>PLAN YOUR PORTIONS</Text>
    <View style={[styles.row, { flexWrap: 'wrap' }]}>{(['servings', 'grams', 'ounces'] as const).map(unit => <Action compact key={unit} disabled={saving} secondary={draft.portionUnit !== unit} onPress={() => { if (unit !== draft.portionUnit) { draft.setPortionUnit(unit); draft.setPortion(''); } }}>{unit === 'servings' ? 'Equal servings' : unit === 'grams' ? 'Grams per portion' : 'Ounces per portion'}</Action>)}</View>
    <Field label={draft.portionUnit === 'servings' ? 'Number of servings' : draft.portionUnit === 'grams' ? 'Grams per portion' : 'Ounces per portion'} value={draft.portion} onChangeText={draft.setPortion} keyboardType="decimal-pad" editable={!saving} />
    {summary && <Card><Text style={[styles.heading, { color: colors.mint }]}>Whole batch · {Math.round(summary.totals.calories)} kcal</Text><Text style={styles.muted}>P {displayAmount(summary.totals.protein)} g · C {displayAmount(summary.totals.carbs)} g · F {displayAmount(summary.totals.fat)} g</Text><Text style={styles.muted}>{displayAmount(summary.totalGrams)} g / {displayAmount(summary.totalGrams / GRAMS_PER_OUNCE)} oz{draft.weight.trim() ? ' finished weight' : ' estimated weight'}</Text><Text style={styles.body}>Makes {displayAmount(summary.servings)} portions of {displayAmount(draft.input!.servingGrams)} g / {displayAmount(draft.input!.servingGrams / GRAMS_PER_OUNCE)} oz each.</Text></Card>}
    <Text style={styles.muted}>Per portion · choose a different amount any time you log this meal.</Text>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{nutrientKeys.map(key => <View key={key} style={{ flexBasis: '46%', flexGrow: 1, gap: 4, alignItems: 'center', backgroundColor: colors.raised, padding: 12, borderRadius: 12 }}><Text style={styles.heading}>{summary ? Math.round(summary.portion[key]) : '—'}{key !== 'calories' ? 'g' : ''}</Text><Text style={styles.muted}>{key === 'calories' ? 'kcal' : key}</Text></View>)}</View>
    <Text style={styles.muted}>Ounces measure weight, not fluid volume. Nutrition assumes the ingredients are evenly distributed.</Text>
    {error && <ErrorNotice message={error} />}
    {!draft.valid && <Text style={styles.muted}>Add a name, at least one ingredient, and positive amounts to save.</Text>}
    <Action busy={saving} disabled={!draft.valid} onPress={() => void save()}>Save meal</Action>
  </>;
}

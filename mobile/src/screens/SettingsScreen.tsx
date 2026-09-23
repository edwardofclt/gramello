import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { ChevronRight, Target } from 'lucide-react-native';
import { useSession } from '../diary/Session';
import { Action, Card, colors, ErrorNotice, Field, Loading, styles } from '../components/ui';
import { AppDialog } from '../components/AppDialog';
import { WaterGoalSettings } from '../components/WaterGoalSettings';
import { errorMessage } from '../lib/api';
import { changeGoal, localDate, macroPercent } from '../lib/nutrition';
import type { Day, Goals } from '../lib/types';
import { useResource } from '../lib/useResource';

function GoalsEditor({ goals, onSaved, onSavingChange }: { goals: Goals; onSaved?: () => void; onSavingChange?: (saving: boolean) => void }) {
  const { api, local } = useSession();
  const [draft, setDraft] = useState(goals);
  const [editing, setEditing] = useState<{ key: keyof Goals; value: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saveLock = useRef(false);
  const valid = draft.calories > 0 && Object.values(draft).every(value => Number.isFinite(value) && value >= 0)
    && (!editing || (editing.value.trim() !== '' && Number.isFinite(Number(editing.value)) && Number(editing.value) >= 0));

  async function save() {
    if (!valid || saveLock.current) return;
    saveLock.current = true; setSaving(true); onSavingChange?.(true); setError(null); setSaved(false);
    try { setDraft(await api<Goals>('/api/goals', { method: 'PUT', body: draft })); setSaved(true); setEditing(null); onSaved?.(); }
    catch (error) { setError(errorMessage(error)); }
    finally { saveLock.current = false; setSaving(false); onSavingChange?.(false); }
  }
  return <>
    <Card style={onSaved ? { borderWidth: 0, padding: 0, gap: 14 } : undefined}>{!onSaved && <View style={styles.row}><Target color={colors.mint} size={24} /><Text style={styles.heading}>Daily goals</Text></View>}<Text style={styles.muted}>Changing calories preserves your macro split. Changing a macro updates your calorie target.</Text>
      {(['calories', 'protein', 'carbs', 'fat'] as const).map(key => <View key={key} style={{ gap: 5 }}>
        <Field label={`${key[0].toUpperCase() + key.slice(1)} (${key === 'calories' ? 'kcal' : 'grams'})`} keyboardType="decimal-pad" editable={!saving} selectTextOnFocus
          horizontal={Boolean(onSaved)} displayLabel={onSaved ? `${key[0].toUpperCase() + key.slice(1)} (${key === 'calories' ? 'kcal' : 'g'})` : undefined}
          hint={onSaved && key !== 'calories' ? `${macroPercent(draft, key).toFixed(1)}% of energy` : undefined}
          value={editing?.key === key ? editing.value : String(Math.round(draft[key] * 100) / 100)}
          onFocus={() => setEditing({ key, value: String(Math.round(draft[key] * 100) / 100) })}
          onBlur={() => setEditing(null)}
          onChangeText={value => { setEditing({ key, value }); setSaved(false); if (value.trim()) setDraft(current => changeGoal(current, key, Number(value))); }} />
        {!onSaved && key !== 'calories' && <Text style={[styles.muted, { color: colors.mint }]}>{macroPercent(draft, key).toFixed(1)}% of energy</Text>}
      </View>)}
      <Text style={styles.muted}>Protein & carbs: 4 kcal/g · Fat: 9 kcal/g. A zero-macro draft starts with a 30/40/30 split when you set calories.</Text>
    </Card>
    {error && <ErrorNotice message={error} />}
    {saved && <Text accessibilityRole="alert" style={{ color: colors.mint, textAlign: 'center' }}>{local ? 'Daily goals saved on this device.' : 'Daily goals saved.'}</Text>}
    <Action busy={saving} disabled={!valid} onPress={() => void save()}>Save daily goals</Action>
  </>;
}

export function GoalsDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { api } = useSession();
  const [date] = useState(localDate);
  const [saving, setSaving] = useState(false);
  const { data, error, loading, reload } = useResource<Day>(api, `/api/day?date=${date}`, false);
  return <AppDialog title="Daily targets" description="Your daily calorie and macro goals." onClose={onClose} busy={saving}>
    {loading && <Loading label="Loading your goals…" />}
    {error && <ErrorNotice message={error} retry={reload} />}
    {data && <GoalsEditor goals={data.goals} onSaved={onSaved} onSavingChange={setSaving} />}
  </AppDialog>;
}

export function SettingsScreen({ onAdvanced }: { onAdvanced: () => void }) {
  const { api, local } = useSession();
  const [date] = useState(localDate);
  // An editor owns its draft until saved or left; foregrounding must not reset it.
  const { data, error, loading, reload } = useResource<Day>(api, `/api/day?date=${date}`, false);
  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View><Text style={styles.eyebrow}>MAKE IT YOURS</Text><Text accessibilityRole="header" style={styles.title}>Settings</Text><Text style={styles.muted}>Your daily calorie, macro, and water goals.</Text></View>
      {loading && <Loading label="Loading your goals…" />}
      {error && <ErrorNotice message={error} retry={reload} />}
      {data && <GoalsEditor goals={data.goals} />}
      <WaterGoalSettings />
      {local && Platform.OS === 'ios' && <Card>
        <Text accessibilityRole="header" style={styles.heading}>Ask Siri</Text>
        <Text selectable style={styles.body}>“Hey Siri, give me my macro check-in in Gramello.”</Text>
        <Text style={styles.muted}>Hear how your logged-day averages compare with your current goals over the seven completed days before today.</Text>
        <Text selectable style={styles.body}>“Hey Siri, suggest an easy meal in Gramello.”</Text>
        <Text selectable style={styles.body}>“Hey Siri, suggest an easy snack in Gramello.”</Text>
        <Text style={styles.muted}>Get a quick idea with portions and estimated nutrition that fits today’s remaining calories, protein, carbs, and fat, based on your logged food. Check the ingredients for your dietary needs.</Text>
        <Text selectable style={styles.body}>“What macros do I have left today in Gramello?”</Text>
        <Text selectable style={styles.body}>“Give me today’s summary in Gramello.”</Text>
        <Text style={styles.muted}>Ask about a single nutrient too: “How much protein have I logged today in Gramello?”</Text>
        <Text selectable style={styles.body}>“Log water in Gramello.”</Text>
        <Text style={styles.muted}>Siri asks for the amount and unit: milliliters or US fluid ounces.</Text>
        <Text selectable style={styles.body}>“Log a saved meal in Gramello.”</Text>
        <Text style={styles.muted}>Choose a meal from My meals and where to log it. One serving is the default; customize servings in Shortcuts.</Text>
        <Text selectable style={styles.body}>“Add yesterday’s lunch to today in Gramello.”</Text>
        <Text style={styles.muted}>Copies the logged entries into today. You can also repeat breakfast, dinner, or snacks. Each run adds new entries.</Text>
        <Text style={styles.muted}>Find all these actions under Gramello in the Shortcuts app. Siri will ask you to unlock your device when needed. Remove any logged entry in your diary as usual.</Text>
      </Card>}
      {local && <Action secondary quiet label="Advanced" onPress={onAdvanced} style={{ justifyContent: 'space-between', paddingHorizontal: 0 }}>
        <View style={{ flex: 1, gap: 4 }}><Text style={styles.body}>Advanced</Text><Text style={styles.muted}>Food catalog updates, export, and import</Text></View>
        <ChevronRight color={colors.muted} size={20} />
      </Action>}
    </ScrollView>
  </KeyboardAvoidingView>;
}

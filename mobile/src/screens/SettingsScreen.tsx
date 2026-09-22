import { LocalDataSettings } from '../components/LocalDataSettings';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { LogOut, Target } from 'lucide-react-native';
import { useSession } from '../auth/Session';
import { Action, Card, colors, ErrorNotice, Field, Loading, styles } from '../components/ui';
import { AppDialog } from '../components/AppDialog';
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
    {saved && <Text accessibilityRole="alert" style={{ color: colors.mint, textAlign: 'center' }}>{local ? 'Daily goals saved on this device.' : 'Daily goals saved. Your web diary uses these too.'}</Text>}
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

export function SettingsScreen() {
  const { api, name, email, signOut, busy, local } = useSession();
  const [date] = useState(localDate);
  // An editor owns its draft until saved or left; foregrounding must not reset it.
  const { data, error, loading, reload } = useResource<Day>(api, `/api/day?date=${date}`, false);
  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View><Text style={styles.eyebrow}>MAKE IT YOURS</Text><Text style={styles.title}>Settings</Text><Text style={styles.muted}>{local ? 'Your goals, food catalog, and saved data.' : 'Your goals and account.'}</Text></View>
      {loading && <Loading label="Loading your goals…" />}
      {error && <ErrorNotice message={error} retry={reload} />}
      {data && <GoalsEditor goals={data.goals} />}
      {local ? <LocalDataSettings local={local} /> : <Card><Text style={styles.eyebrow}>YOUR ACCOUNT</Text><View><Text style={styles.heading}>{name}</Text>{email && email !== name && <Text style={styles.muted}>{email}</Text>}</View><Text style={styles.muted}>Your diary stays in sync with Gramello on the web.</Text><Action secondary busy={busy} onPress={() => void signOut()}><LogOut color={colors.muted} size={18} /><Text style={styles.body}>Sign out</Text></Action></Card>}
    </ScrollView>
  </KeyboardAvoidingView>;
}

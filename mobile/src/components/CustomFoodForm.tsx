import { useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { customFoodFields, customFoodInput, emptyCustomFood } from '../../../lib/custom-food-form';
import type { Food } from '../../../lib/food';
import { Action, ErrorNotice, Field, isWeb, styles } from './ui';
import type { useSession } from '../diary/Session';

export function CustomFoodForm({ initialName, api, onSaved, onBack, onBusy }: {
  initialName: string; api: ReturnType<typeof useSession>['api']; onSaved: (food: Food) => void; onBack: () => void; onBusy: (busy: boolean) => void;
}) {
  const [draft, setDraft] = useState(() => emptyCustomFood(initialName));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const lock = useRef(false);
  async function save() {
    if (lock.current) return;
    let input;
    try { input = customFoodInput(draft); }
    catch { setError('Enter a name, serving description, and all four nutrition values. Use zero when the amount is zero. Optional weight must be greater than zero.'); return; }
    lock.current = true; setSaving(true); onBusy(true); setError('');
    try { const { food } = await api<{ food: Food }>('/api/foods/custom', { method: 'POST', body: input }); onSaved(food); }
    catch (error) { setError(error instanceof Error ? error.message : 'Your food could not be saved. Try again.'); }
    finally { lock.current = false; setSaving(false); onBusy(false); }
  }
  return <View style={{ gap: 16 }}>
    <Action quiet secondary disabled={saving} onPress={onBack}>Back to search</Action>
    <Text style={styles.muted}>Enter the total nutrition for one serving as described below. {isWeb ? 'This food will be searchable by everyone and labeled Unverified.' : 'This food stays on your device and is labeled Unverified.'}</Text>
    {customFoodFields.map(([key, label, type]) => <Field key={key} label={label} value={draft[key]} editable={!saving} autoFocus={key === 'name'}
      maxLength={key === 'name' ? 200 : 120} keyboardType={type === 'number' ? 'decimal-pad' : 'default'}
      placeholder={key === 'servingLabel' ? 'e.g. 1 bowl or 2 slices' : key === 'servingGrams' ? 'Leave blank if unknown' : type === 'number' ? '0' : undefined}
      onChangeText={value => setDraft(current => ({ ...current, [key]: value }))}/>)}
    {error && <ErrorNotice message={error}/>}
    <Action busy={saving} onPress={() => void save()}>Save custom food</Action>
  </View>;
}

import { Text, View } from 'react-native';
import { useEntryEdit } from '../../../hooks/use-entry-edit';
import { entryMeals } from '../../../lib/entry-edit';
import { amountLabels, nutrientKeys, unitLabels } from '../../../lib/meals';
import { useSession } from '../auth/Session';
import { AppDialog } from '../components/AppDialog';
import { FoodVerification } from '../components/FoodVerification';
import { Action, ErrorNotice, Field, styles } from '../components/ui';
import type { Entry } from '../lib/types';

export function EntrySheet({ entry, onClose, onSaved }: { entry: Entry; onClose: () => void; onSaved: () => void }) {
  const { api } = useSession();
  const edit = useEntryEdit(entry, api, onSaved);
  return <AppDialog title="Edit food" description="Update the amount or meal for this logged food." busy={edit.saving} onClose={onClose}>
    <View style={{ gap: 5 }}><Text style={styles.heading}>{entry.name}</Text><Text style={styles.muted}>{entry.brand || entry.source}{entry.servingLabel ? ` · ${entry.servingLabel}` : ''}</Text><FoodVerification verified={entry.verified}/></View>
    {edit.error && <ErrorNotice message={edit.error}/>}
    <Text style={styles.muted}>Meal</Text>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{entryMeals.map(meal => <Action key={meal} secondary={edit.meal !== meal} disabled={edit.saving} onPress={() => edit.setMeal(meal)}>{meal}</Action>)}</View>
    <Text style={styles.muted}>Measure</Text>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{edit.units.map(unit => <Action key={unit} secondary={edit.unit !== unit} disabled={edit.saving} onPress={() => edit.changeUnit(unit)}>{unitLabels[unit]}</Action>)}</View>
    <Field label={amountLabels[edit.unit]} keyboardType="decimal-pad" value={edit.quantity} editable={!edit.saving} onChangeText={edit.setQuantity}/>
    <View style={[styles.between, { flexWrap: 'wrap' }]}>{nutrientKeys.map(key => <View key={key} style={{ gap: 5 }}><Text style={styles.heading}>{edit.portion ? Math.round(edit.portion[key]) : '—'}{key === 'calories' ? '' : 'g'}</Text><Text style={styles.muted}>{key === 'calories' ? 'kcal' : key}</Text></View>)}</View>
    {!edit.portion && <Text style={styles.muted}>Enter an amount greater than zero, up to 1,000,000.</Text>}
    <Action disabled={!edit.portion} busy={edit.saving} onPress={() => void edit.save()}>Save changes</Action>
    <Action secondary disabled={edit.saving} onPress={onClose}>Cancel</Action>
  </AppDialog>;
}

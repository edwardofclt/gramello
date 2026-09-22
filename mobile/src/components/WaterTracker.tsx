import { useEffect, useState } from 'react';
import { AppState, Text, View } from 'react-native';
import { Droplets, Trash2 } from 'lucide-react-native';
import { useSession } from '../auth/Session';
import { Action, Card, colors, ErrorNotice, Field, Loading, Meter, styles } from './ui';
import { AppDialog } from './AppDialog';
import { useWater, useWaterGoalDraft } from '../../../lib/use-water';
import { waterAmountSchema, waterLabel, waterPresets, waterToMl, waterUnitLabel, type WaterGoal } from '../../../lib/water';

function WaterGoalEditor({ goal, busy, error, onSave }: { goal: WaterGoal; busy: boolean; error: string | null; onSave: (goal: WaterGoal) => Promise<void> }) {
  const draft = useWaterGoalDraft(goal);
  return <>
    <Text style={styles.muted}>Water unit</Text>
    <View style={styles.row}>{(['ml', 'fl-oz'] as const).map(unit => <Action key={unit} secondary={draft.unit !== unit} disabled={busy} label={`Use ${waterUnitLabel(unit)}`} onPress={() => draft.changeUnit(unit)}>{waterUnitLabel(unit)}</Action>)}</View>
    <Field label={`Daily water goal (${waterUnitLabel(draft.unit)})`} keyboardType="decimal-pad" value={draft.amount} onChangeText={draft.changeAmount} editable={!busy} selectTextOnFocus />
    {!draft.valid && <ErrorNotice message="Enter a goal between 1 and 10,000 mL (or the equivalent in US fl oz)." />}
    {error && <ErrorNotice message={error} />}
    <Action busy={busy} disabled={!draft.valid} onPress={() => void onSave(draft.goal)}>Save water goal</Action>
  </>;
}

export function WaterTracker({ date }: { date: string }) {
  const { api } = useSession();
  const water = useWater(api, date);
  const { reload } = water;
  const [amount, setAmount] = useState('');
  const [editingGoal, setEditingGoal] = useState(false);
  const [showEntries, setShowEntries] = useState(false);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') reload(); });
    return () => subscription.remove();
  }, [reload]);
  const { data } = water;
  const unit = data?.goal.unit ?? 'ml';
  const disabled = water.busy || water.loading || !data;
  const valid = amount.trim() !== '' && waterAmountSchema.safeParse(waterToMl(Number(amount), unit)).success;

  return <>
    <Card>
      <View style={[styles.between, { flexWrap: 'wrap' }]}><View style={styles.row}><Droplets color={colors.blue} size={22} /><Text accessibilityRole="header" style={styles.heading}>Water intake</Text></View><Action quiet secondary compact disabled={disabled} onPress={() => setEditingGoal(true)}>Edit water goal</Action></View>
      {water.error && !editingGoal && <ErrorNotice message={water.error} retry={water.busy ? undefined : water.reload} />}
      {!data && water.loading && <Loading label="Loading water intake…" />}
      {data && <>
        <Text testID="water-total" accessibilityLiveRegion="polite" style={[styles.heading, { fontSize: 25 }]}>{waterLabel(data.totalMl, unit)} <Text style={styles.muted}>of {waterLabel(data.goal.goalMl, unit)}</Text></Text>
        <Meter color={colors.blue} value={data.totalMl / data.goal.goalMl * 100} label={`Water: ${waterLabel(data.totalMl, unit)} of ${waterLabel(data.goal.goalMl, unit)}`} />
        <Text style={styles.muted}>{data.totalMl >= data.goal.goalMl ? 'Water goal reached!' : `${waterLabel(data.goal.goalMl - data.totalMl, unit)} to your daily goal`}</Text>
        <View style={[styles.row, { flexWrap: 'wrap', gap: 8 }]}>{waterPresets(unit).map(value => <Action key={value} secondary compact disabled={disabled} style={{ flexGrow: 1 }} onPress={() => void water.add(value, unit)}>{`+ ${value} ${waterUnitLabel(unit)}`}</Action>)}</View>
        <Field label={`Custom water amount (${waterUnitLabel(unit)})`} keyboardType="decimal-pad" value={amount} onChangeText={setAmount} editable={!disabled} placeholder={unit === 'ml' ? '350' : '12'} />
        {amount !== '' && !valid && <ErrorNotice message="Enter an amount between 1 and 10,000 mL (or the equivalent in US fl oz)." />}
        <Action disabled={disabled || !valid} onPress={() => void water.add(Number(amount), unit).then(saved => { if (saved) setAmount(''); })}>Add water</Action>
        {data.entries.length ? <>
          <Action secondary quiet onPress={() => setShowEntries(value => !value)}>{`${showEntries ? 'Hide' : 'Show'} water entries (${data.entries.length})`}</Action>
          {showEntries && data.entries.map(entry => <View key={entry.id} style={[styles.between, { borderTopWidth: 1, borderColor: colors.border }]}><Text style={styles.body}>{waterLabel(entry.amountMl, unit)}</Text><Action quiet secondary compact disabled={disabled} label={`Remove ${waterLabel(entry.amountMl, unit)} water`} onPress={() => void water.remove(entry.id)}><Trash2 color={colors.muted} size={18} /></Action></View>)}
        </> : <Text style={styles.muted}>No water logged for this day yet.</Text>}
      </>}
    </Card>
    {editingGoal && data && <AppDialog title="Daily water goal" description="Choose your own daily target and preferred unit. Your goal applies across your diary." busy={water.busy} onClose={() => setEditingGoal(false)}><WaterGoalEditor goal={data.goal} busy={water.busy} error={water.error} onSave={async goal => { if (await water.saveGoal(goal)) { setAmount(''); setEditingGoal(false); } }} /></AppDialog>}
  </>;
}

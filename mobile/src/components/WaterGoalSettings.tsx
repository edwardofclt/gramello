import { useState } from 'react';
import { Text, View } from 'react-native';
import { Droplets } from 'lucide-react-native';
import { useWater, useWaterGoalDraft } from '../../../lib/use-water';
import { waterUnitLabel, type WaterGoal } from '../../../lib/water';
import { useSession } from '../auth/Session';
import { localDate } from '../lib/nutrition';
import { Action, Card, colors, ErrorNotice, Field, Loading, styles } from './ui';

export function WaterGoalEditor({ goal, busy, error, onSave }: {
  goal: WaterGoal; busy: boolean; error: string | null; onSave: (goal: WaterGoal) => Promise<boolean>;
}) {
  const draft = useWaterGoalDraft(goal);
  const [saved, setSaved] = useState(false);
  return <>
    <Text style={styles.muted}>Water unit</Text>
    <View style={styles.row}>{(['ml', 'fl-oz'] as const).map(unit => <Action key={unit} secondary={draft.unit !== unit} disabled={busy} label={`Use ${waterUnitLabel(unit)}`} onPress={() => { setSaved(false); draft.changeUnit(unit); }}>{waterUnitLabel(unit)}</Action>)}</View>
    <Field label={`Daily water goal (${waterUnitLabel(draft.unit)})`} keyboardType="decimal-pad" value={draft.amount} onChangeText={value => { setSaved(false); draft.changeAmount(value); }} editable={!busy} selectTextOnFocus />
    {!draft.valid && <ErrorNotice message="Enter a goal between 1 and 10,000 mL (or the equivalent in US fl oz)." />}
    {error && <ErrorNotice message={error} />}
    {saved && <Text accessibilityRole="alert" style={{ color: colors.mint }}>Daily water goal saved.</Text>}
    <Action busy={busy} disabled={!draft.valid} onPress={() => { setSaved(false); void onSave(draft.goal).then(setSaved); }}>Save water goal</Action>
  </>;
}

export function WaterGoalSettings() {
  const { api } = useSession();
  const [date] = useState(localDate);
  const water = useWater(api, date);
  return <Card>
    <View style={styles.row}><Droplets color={colors.blue} size={24} /><Text accessibilityRole="header" style={styles.heading}>Daily water goal</Text></View>
    <Text style={styles.muted}>Choose your daily target and preferred unit. Your goal applies across your diary.</Text>
    {!water.data && water.loading && <Loading label="Loading your water goal…" />}
    {!water.data && water.error && <ErrorNotice message={water.error} retry={water.reload} />}
    {water.data && <WaterGoalEditor goal={water.data.goal} busy={water.busy} error={water.error} onSave={water.saveGoal} />}
  </Card>;
}

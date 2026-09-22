import { useState } from 'react';
import { TrackerShell, type Tab } from './TrackerShell';
import { isWeb } from './ui';
import { localDate } from '../lib/nutrition';
import type { Meal } from '../lib/types';
import { DiaryScreen } from '../screens/DiaryScreen';
import { TrendsScreen } from '../screens/TrendsScreen';
import { GoalsDialog, SettingsScreen } from '../screens/SettingsScreen';
import { FoodSheet } from '../screens/FoodSheet';

export function Tracker() {
  const [tab, setTab] = useState<Tab>('diary');
  const [date, setDate] = useState(localDate);
  const [range, setRange] = useState(7);
  const [meal, setMeal] = useState<Meal | null>(null);
  const [goalsOpen, setGoalsOpen] = useState(false);
  const [revision, setRevision] = useState(0);
  const refresh = () => setRevision(value => value + 1);
  const editGoals = () => isWeb ? setGoalsOpen(true) : setTab('settings');
  return <>
    <TrackerShell tab={tab} onTab={setTab} onAdd={() => setMeal('Breakfast')} onGoals={editGoals}>
      {tab === 'diary' ? <DiaryScreen key={revision} date={date} onDate={setDate} onAdd={setMeal} onGoals={editGoals} />
        : tab === 'trends' ? <TrendsScreen key={revision} range={range} onRange={setRange} /> : <SettingsScreen />}
    </TrackerShell>
    {meal && <FoodSheet date={date} initialMeal={meal} onClose={() => setMeal(null)} onSaved={() => { setMeal(null); refresh(); }} />}
    {goalsOpen && <GoalsDialog onClose={() => setGoalsOpen(false)} onSaved={() => { setGoalsOpen(false); refresh(); }} />}
  </>;
}

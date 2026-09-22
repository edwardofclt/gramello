import { useState } from 'react';
import { useAnalyticsScreen } from '../analytics/useScreen';
import { useSession } from '../auth/Session';
import { TrackerShell, type Tab } from './TrackerShell';
import { isWeb } from './ui';
import { localDate } from '../lib/nutrition';
import type { Meal } from '../lib/types';
import { DiaryScreen } from '../screens/DiaryScreen';
import { TrendsScreen } from '../screens/TrendsScreen';
import { GoalsDialog, SettingsScreen } from '../screens/SettingsScreen';
import { AdvancedScreen } from '../screens/AdvancedScreen';
import { FoodSheet } from '../screens/FoodSheet';

export function Tracker() {
  const { local } = useSession();
  const [tab, setTab] = useState<Tab>('diary');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [date, setDate] = useState(localDate);
  const [range, setRange] = useState(7);
  const [meal, setMeal] = useState<Meal | null>(null);
  const [goalsOpen, setGoalsOpen] = useState(false);
  const [revision, setRevision] = useState(0);
  useAnalyticsScreen(meal ? 'Add Food' : goalsOpen ? 'Goals' : tab === 'diary' ? 'Diary' : tab === 'trends' ? 'Trends' : advancedOpen && local ? 'Advanced' : 'Settings');
  const refresh = () => setRevision(value => value + 1);
  const selectTab = (next: Tab) => { setAdvancedOpen(false); setTab(next); };
  const editGoals = () => isWeb ? setGoalsOpen(true) : selectTab('settings');
  return <>
    <TrackerShell tab={tab} onTab={selectTab} onAdd={() => setMeal('Breakfast')} onGoals={editGoals}>
      {tab === 'diary' ? <DiaryScreen key={revision} date={date} onDate={setDate} onAdd={setMeal} onGoals={editGoals} />
        : tab === 'trends' ? <TrendsScreen key={revision} range={range} onRange={setRange} />
        : advancedOpen && local ? <AdvancedScreen local={local} onBack={() => setAdvancedOpen(false)} />
        : <SettingsScreen onAdvanced={() => setAdvancedOpen(true)} />}
    </TrackerShell>
    {meal && <FoodSheet date={date} initialMeal={meal} onClose={() => setMeal(null)} onSaved={() => { setMeal(null); refresh(); }} />}
    {goalsOpen && <GoalsDialog onClose={() => setGoalsOpen(false)} onSaved={() => { setGoalsOpen(false); refresh(); }} />}
  </>;
}

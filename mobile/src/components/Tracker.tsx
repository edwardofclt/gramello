import { useEffect, useState } from 'react';
import { Linking, Platform } from 'react-native';
import { isTodayWidgetLink } from '../widgets/links';
import { useAnalyticsScreen } from '../analytics/useScreen';
import { useSession } from '../diary/Session';
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
  const refreshWidgets = local?.refreshWidgets;
  const [tab, setTab] = useState<Tab>('diary');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [date, setDate] = useState(localDate);
  const [range, setRange] = useState(7);
  const [meal, setMeal] = useState<Meal | null>(null);
  const [goalsOpen, setGoalsOpen] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    let mounted = true;
    const open = (url: string | null) => {
      if (!mounted || !isTodayWidgetLink(url)) return;
      setTab('diary'); setAdvancedOpen(false); setMeal(null); setGoalsOpen(false);
      setDate(localDate()); setRevision(value => value + 1);
      void refreshWidgets?.();
    };
    const subscription = Linking.addEventListener('url', event => open(event.url));
    void Linking.getInitialURL().then(open).catch(() => {});
    return () => { mounted = false; subscription.remove(); };
  // Session's local wrapper is recreated after imports. Capture only the stable
  // refresh function so a rerender cannot replay the initial URL over navigation.
  }, [refreshWidgets]);
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

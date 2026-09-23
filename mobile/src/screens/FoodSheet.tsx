import { useState } from 'react';
import { View } from 'react-native';
import { Action, styles } from '../components/ui';
import { AppDialog } from '../components/AppDialog';
import { formatDate } from '../lib/nutrition';
import type { Food, Meal } from '../lib/types';
import { FoodPicker } from './FoodPicker';
import { MyMeals } from './MyMeals';
import { useSession } from '../diary/Session';

export function FoodSheet({ date, initialMeal, onClose, onSaved }: { date: string; initialMeal: Meal; onClose: () => void; onSaved: () => void }) {
  const { local } = useSession();
  const [title, setTitle] = useState('Add food');
  const [library, setLibrary] = useState(false);
  const [selected, setSelected] = useState<Food | undefined>();
  const [busy, setBusy] = useState(false);
  return <AppDialog title={library ? 'My meals' : title} description={`${library ? 'Build a meal, save it, and portion it your way.' : local ? 'Search your downloaded food catalog and private custom foods, or reuse your meals.' : 'Search foods, restaurants, and community submissions, or reuse your own meals.'} · ${formatDate(date)}`} onClose={onClose} busy={busy}>
    <View style={styles.row}><Action secondary={library} disabled={busy} onPress={() => { setSelected(undefined); setLibrary(false); }}>Search foods</Action><Action secondary={!library} disabled={busy} onPress={() => setLibrary(true)}>My meals</Action></View>
    {library ? <MyMeals date={date} initialMeal={initialMeal} onBusy={setBusy} onChoose={food => { setSelected(food); setLibrary(false); }} />
      : <FoodPicker key={selected?.id ?? 'search'} date={date} initialMeal={initialMeal} initialFood={selected} onSaved={onSaved} onBusy={setBusy} onTitle={setTitle} />}
  </AppDialog>;
}

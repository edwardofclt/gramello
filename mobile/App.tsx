import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Auth0Provider } from 'react-native-auth0';
import { OverlayProvider } from '@gluestack-ui/core/overlay/creator';
import { Utensils } from 'lucide-react-native';
import { SessionProvider, useSession } from './src/auth/Session';
import { Action, Card, colors, ErrorNotice, isWeb, Loading, styles } from './src/components/ui';
import { Brand, TrackerShell, type Tab } from './src/components/TrackerShell';
import { configuration, configurationError } from './src/lib/config';
import { localDate } from './src/lib/nutrition';
import type { Meal } from './src/lib/types';
import { DiaryScreen } from './src/screens/DiaryScreen';
import { TrendsScreen } from './src/screens/TrendsScreen';
import { GoalsDialog, SettingsScreen } from './src/screens/SettingsScreen';
import { FoodSheet } from './src/screens/FoodSheet';

function Welcome() {
  const { signIn, busy, message } = useSession();
  if (isWeb) return <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 24, justifyContent: 'center', alignItems: 'center' }}>
    <Card style={{ width: '100%', maxWidth: 460, padding: 36, gap: 24, boxShadow: '0 18px 55px #020b1166' }}>
      <Brand /><Text accessibilityRole="header" style={[styles.title, { fontSize: 40, lineHeight: 45, marginTop: 8 }]}>Your nutrition,{`\n`}in one place.</Text>
      <Text style={[styles.muted, { fontSize: 16, lineHeight: 26 }]}>Keep your food diary, daily goals, and progress together in your own account.</Text>
      {message && <ErrorNotice message={message} />}<Action busy={busy} onPress={() => void signIn()}>Sign in to Nourish</Action>
      <Text style={[styles.muted, { textAlign: 'center' }]}>Secure sign-in with Auth0</Text>
    </Card>
  </ScrollView>;
  return <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 24, justifyContent: 'center', gap: 28 }}>
    <Brand />
    <View style={{ width: 180, height: 180, borderRadius: 90, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, justifyContent: 'center', alignItems: 'center', alignSelf: 'center' }}><Utensils size={48} color={colors.mint} /></View>
    <View style={{ gap: 12 }}><Text style={styles.eyebrow}>GOOD FOOD. BETTER AWARENESS.</Text><Text style={[styles.title, { fontSize: 42, lineHeight: 48 }]}>A little more{`\n`}in tune with you.</Text><Text style={[styles.muted, { fontSize: 16, lineHeight: 25 }]}>Your daily diary, nutrition goals, and progress. Together in one nourishing little habit.</Text></View>
    <Card>{['Log meals in moments', 'Find your daily balance', 'See the progress you’re making'].map((text, index) => <View key={text} style={styles.row}><Text style={{ color: colors.mint, fontWeight: '700' }}>0{index + 1}</Text><Text style={styles.body}>{text}</Text></View>)}</Card>
    {message && <ErrorNotice message={message} />}<Action busy={busy} onPress={() => void signIn()}>Continue with Nourish</Action>
    <Text style={[styles.muted, { textAlign: 'center' }]}>Sign in with the same account you use on the web.</Text>
  </ScrollView>;
}

function Tracker() {
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

function AuthenticatedApp() {
  const { signedIn, loading } = useSession();
  return <SafeAreaView style={styles.screen} edges={signedIn && !loading ? ['top', 'left', 'right'] : ['top', 'right', 'bottom', 'left']}>
    {loading ? <View style={{ flex: 1, justifyContent: 'center' }}><Loading label="Restoring your account…" /></View> : signedIn ? <Tracker /> : <Welcome />}
  </SafeAreaView>;
}

export default function App() {
  const error = configurationError();
  return <SafeAreaProvider><OverlayProvider><StatusBar style="light" />
    {error ? <SafeAreaView style={styles.screen}><View style={[styles.content, { flex: 1, justifyContent: 'center' }]}><Brand /><Text style={styles.title}>Let’s connect Nourish</Text><ErrorNotice message={error} /><Text style={styles.muted}>Setup instructions are in mobile/README.md. Your diary will appear after sign-in.</Text></View></SafeAreaView>
      : <Auth0Provider domain={configuration.domain} clientId={configuration.clientId}><SessionProvider><AuthenticatedApp /></SessionProvider></Auth0Provider>}
  </OverlayProvider></SafeAreaProvider>;
}

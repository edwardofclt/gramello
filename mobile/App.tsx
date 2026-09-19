import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Auth0Provider } from 'react-native-auth0';
import { OverlayProvider } from '@gluestack-ui/core/overlay/creator';
import { BookOpen, Leaf, Settings, TrendingUp, Utensils } from 'lucide-react-native';
import { SessionProvider, useSession } from './src/auth/Session';
import { Action, Card, colors, ErrorNotice, Loading, styles } from './src/components/ui';
import { configuration, configurationError } from './src/lib/config';
import { DiaryScreen } from './src/screens/DiaryScreen';
import { TrendsScreen } from './src/screens/TrendsScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';

function Brand() {
  return <View style={[styles.row, { paddingHorizontal: 20, paddingVertical: 16 }]}><View style={{ padding: 8, borderRadius: 11, backgroundColor: colors.mint }}><Leaf color={colors.background} size={22} /></View><Text style={{ color: colors.text, fontSize: 22, fontWeight: '700', letterSpacing: -.5 }}>Nourish</Text></View>;
}

function Welcome() {
  const { signIn, busy, message } = useSession();
  return <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 24, justifyContent: 'center', gap: 28 }}>
    <View style={{ width: 180, height: 180, borderRadius: 90, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, justifyContent: 'center', alignItems: 'center', alignSelf: 'center' }}><View style={{ width: 124, height: 124, borderRadius: 62, borderWidth: 2, borderColor: colors.mint, alignItems: 'center', justifyContent: 'center' }}><Utensils size={48} color={colors.mint} /></View></View>
    <View style={{ gap: 12 }}><Text style={styles.eyebrow}>GOOD FOOD. BETTER AWARENESS.</Text><Text style={[styles.title, { fontSize: 42, lineHeight: 48 }]}>A little more{`\n`}in tune with you.</Text><Text style={[styles.muted, { fontSize: 16, lineHeight: 25 }]}>Your daily diary, nutrition goals, and progress. Together in one nourishing little habit.</Text></View>
    <Card>{['Log meals in moments', 'Find your daily balance', 'See the progress you’re making'].map((text, index) => <View key={text} style={styles.row}><Text style={{ color: colors.mint, fontWeight: '700' }}>0{index + 1}</Text><Text style={styles.body}>{text}</Text></View>)}</Card>
    {message && <ErrorNotice message={message} />}
    <Action busy={busy} onPress={() => void signIn()}>Continue with Nourish</Action>
    <Text style={[styles.muted, { textAlign: 'center' }]}>Sign in with the same account you use on the web.</Text>
  </ScrollView>;
}

const tabs = [{ key: 'diary', label: 'Diary', Icon: BookOpen }, { key: 'trends', label: 'Trends', Icon: TrendingUp }, { key: 'settings', label: 'Settings', Icon: Settings }] as const;
function Tracker() {
  const [tab, setTab] = useState<typeof tabs[number]['key']>('diary');
  return <>
    <View style={{ flex: 1 }}>{tab === 'diary' ? <DiaryScreen /> : tab === 'trends' ? <TrendsScreen /> : <SettingsScreen />}</View>
    <SafeAreaView edges={['bottom']} accessibilityRole="tablist" style={{ flexDirection: 'row', borderTopWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 10, gap: 8 }}>
      {tabs.map(({ key, label, Icon }) => <View key={key} style={{ flex: 1 }}><Action secondary label={`${label} tab${tab === key ? ', selected' : ''}`} onPress={() => setTab(key)}><View style={{ alignItems: 'center', paddingVertical: 6, gap: 5 }}><Icon size={20} color={tab === key ? colors.mint : colors.muted} /><Text style={{ color: tab === key ? colors.mint : colors.muted, fontSize: 11, fontWeight: '600' }}>{label}</Text></View></Action></View>)}
    </SafeAreaView>
  </>;
}

function AuthenticatedApp() {
  const { signedIn, loading } = useSession();
  return <SafeAreaView style={styles.screen} edges={signedIn && !loading ? ['top', 'left', 'right'] : ['top', 'right', 'bottom', 'left']}><Brand />{loading ? <View style={{ flex: 1, justifyContent: 'center' }}><Loading label="Restoring your account…" /></View> : signedIn ? <Tracker /> : <Welcome />}</SafeAreaView>;
}

export default function App() {
  const error = configurationError();
  return <SafeAreaProvider><OverlayProvider><StatusBar style="light" />
    {error ? <SafeAreaView style={styles.screen}><Brand /><View style={[styles.content, { flex: 1, justifyContent: 'center' }]}><Text style={styles.title}>Let’s connect Nourish</Text><ErrorNotice message={error} /><Text style={styles.muted}>Setup instructions are in mobile/README.md. Your diary will appear after sign-in.</Text></View></SafeAreaView>
      : <Auth0Provider domain={configuration.domain} clientId={configuration.clientId}><SessionProvider><AuthenticatedApp /></SessionProvider></Auth0Provider>}
  </OverlayProvider></SafeAreaProvider>;
}

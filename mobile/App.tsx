import { useEffect } from 'react';
import { Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { OverlayProvider } from '@gluestack-ui/core/overlay/creator';
import { SessionProvider } from './src/diary/Session';
import { ErrorNotice, styles } from './src/components/ui';
import { Brand } from './src/components/TrackerShell';
import { Tracker } from './src/components/Tracker';
import { initializeAnalytics } from './src/analytics/client';
import { configurationError } from './src/lib/config';

export default function App() {
  useEffect(() => { initializeAnalytics(); }, []);
  const error = configurationError();
  return <SafeAreaProvider><OverlayProvider><StatusBar style="light" />
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      {error ? <View style={[styles.content, { flex: 1, justifyContent: 'center' }]}><Brand /><Text style={styles.title}>Let’s connect Gramello</Text><ErrorNotice message={error} /></View>
        : <SessionProvider><Tracker /></SessionProvider>}
    </SafeAreaView>
  </OverlayProvider></SafeAreaProvider>;
}

import { useEffect } from 'react';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { OverlayProvider } from '@gluestack-ui/core/overlay/creator';
import { SessionProvider } from './src/auth/Session';
import { Tracker } from './src/components/Tracker';
import { initializeAnalytics } from './src/analytics/client';
import { styles } from './src/components/ui';

export default function App() {
  useEffect(() => { initializeAnalytics(); }, []);
  return <SafeAreaProvider><OverlayProvider><StatusBar style="light" />
    <SafeAreaView style={styles.screen} edges={['top','left','right']}>
      <SessionProvider><Tracker /></SessionProvider>
    </SafeAreaView>
  </OverlayProvider></SafeAreaProvider>;
}

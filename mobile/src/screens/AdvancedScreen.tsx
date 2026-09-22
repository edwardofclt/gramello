import { useEffect } from 'react';
import { BackHandler, ScrollView, Text, View } from 'react-native';
import { ArrowLeft } from 'lucide-react-native';
import { LocalDataSettings } from '../components/LocalDataSettings';
import { Action, colors, styles } from '../components/ui';
import type { LocalServices } from '../local/services';

export function AdvancedScreen({ local, onBack }: { local: LocalServices; onBack: () => void }) {
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onBack();
      return true;
    });
    return () => subscription.remove();
  }, [onBack]);

  return <ScrollView contentContainerStyle={styles.content}>
    <Action secondary quiet label="Back to Settings" onPress={onBack} style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }}>
      <ArrowLeft color={colors.muted} size={20} /><Text style={styles.body}>Settings</Text>
    </Action>
    <View><Text style={styles.eyebrow}>SETTINGS</Text><Text accessibilityRole="header" style={styles.title}>Advanced</Text><Text style={styles.muted}>Manage your food catalog and saved data.</Text></View>
    <LocalDataSettings local={local} />
  </ScrollView>;
}

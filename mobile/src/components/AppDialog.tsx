import { useEffect, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { Action, colors, isWeb, styles, useLayout } from './ui';

// React Native Web's Modal owns focus trapping and Escape.
// Only the presentation changes: a centered web dialog or a native page sheet.
export function AppDialog({ title, description, children, onClose, busy = false }: {
  title: string; description?: string; children: ReactNode; onClose: () => void; busy?: boolean;
}) {
  const { height, desktop } = useLayout();
  const [presented, setPresented] = useState(isWeb);
  // Capture before the search input auto-focuses. RN Web's own effect runs
  // after that focus and would otherwise try to restore the removed input.
  const [trigger] = useState(() => isWeb && document.activeElement instanceof HTMLElement ? document.activeElement : null);
  useEffect(() => () => {
    if (trigger) requestAnimationFrame(() => { if (trigger.isConnected) trigger.focus(); });
  }, [trigger]);
  const close = () => { if (presented && !busy) onClose(); };
  return <Modal visible accessibilityLabel={title} transparent={isWeb} animationType={isWeb ? 'none' : 'slide'}
    presentationStyle={isWeb ? 'overFullScreen' : 'pageSheet'} onShow={() => setPresented(true)} onRequestClose={close}>
    <View style={[{ flex: 1 }, isWeb && { backgroundColor: '#020b11bb', padding: 16, justifyContent: 'center', alignItems: 'center' }]}>
      <SafeAreaView testID="app-dialog" style={isWeb ? {
        flexShrink: 1, zIndex: 1, width: '100%', maxWidth: 650, maxHeight: Math.min(height - 32, desktop ? 760 : height - 32),
        backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 22, overflow: 'hidden',
        boxShadow: '0 24px 80px #0008',
      } : styles.screen} edges={['top', 'bottom']}>
        <KeyboardAvoidingView style={{ flexShrink: 1, ...(isWeb ? {} : { flex: 1 }) }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[styles.between, { padding: isWeb ? 24 : 20, paddingBottom: 14, flexShrink: 0 }]}>
            <View style={{ gap: 5, flex: 1 }}><Text accessibilityRole="header" style={styles.heading}>{title}</Text>{description && <Text style={styles.muted}>{description}</Text>}</View>
            <Action quiet secondary compact disabled={busy} label={`Close ${title.toLowerCase()}`} onPress={close}><X size={20} color={colors.muted} /></Action>
          </View>
          <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={[styles.content, { paddingTop: 8, paddingHorizontal: isWeb ? 24 : 20 }]} keyboardShouldPersistTaps="handled" keyboardDismissMode={isWeb ? 'none' : 'on-drag'}>
            {/* Native autoFocus must wait until the sheet's presentation finishes.
                Opening the keyboard during that transition can interrupt the sheet. */}
            {presented && children}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
      {isWeb && <Pressable accessibilityLabel="Dismiss dialog" accessible={false} tabIndex={-1} onPress={close}
        style={{ position: 'absolute', inset: 0 }} />}
    </View>
  </Modal>;
}

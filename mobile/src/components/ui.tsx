import type { ComponentProps, ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { createButton } from '@gluestack-ui/core/button/creator';
import { createInput } from '@gluestack-ui/core/input/creator';
import { createProgress } from '@gluestack-ui/core/progress/creator';

// gluestack's accessible, unstyled primitives keep the native design independent
// of a CSS runtime. These are the shared controls used throughout the app.
const Button = createButton({ Root: Pressable, Text, Group: View, Spinner: ActivityIndicator, Icon: View });
const Input = createInput({ Root: View, Icon: View, Slot: Pressable, Input: TextInput });
const Progress = createProgress({ Root: View, FilledTrack: View });

export const colors = {
  background: '#0b121a', surface: '#121e2a', raised: '#192938', border: '#293b4a',
  text: '#f1f6f8', muted: '#a7bac9', mint: '#6ee7c7', blue: '#78a9ff', amber: '#ffbd66', danger: '#ff9b9b',
};
export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, gap: 20, paddingBottom: 32 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  title: { color: colors.text, fontSize: 30, fontWeight: '700', letterSpacing: -1 },
  heading: { color: colors.text, fontSize: 19, fontWeight: '700' },
  body: { color: colors.text, fontSize: 15, lineHeight: 22 },
  muted: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  eyebrow: { color: colors.mint, fontSize: 11, fontWeight: '700', letterSpacing: 1.8 },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 22, padding: 20, gap: 16 },
  divider: { height: 1, backgroundColor: colors.border },
  center: { alignItems: 'center', justifyContent: 'center', gap: 14, padding: 32 },
});

export function Card({ children }: { children: ReactNode }) { return <View style={styles.card}>{children}</View>; }

export function Action({ children, onPress, disabled, busy, secondary, label, compact }: {
  children: ReactNode; onPress: () => void; disabled?: boolean; busy?: boolean;
  secondary?: boolean; label?: string; compact?: boolean;
}) {
  return <Button accessibilityLabel={label} isDisabled={disabled || busy} onPress={onPress}
    style={{ minHeight: 48, paddingHorizontal: compact ? 12 : 20, borderRadius: 14, justifyContent: 'center', alignItems: 'center', flexDirection: 'row', gap: 8,
      backgroundColor: secondary ? colors.raised : colors.mint, opacity: disabled || busy ? 0.5 : 1 }}>
    {busy && <Button.Spinner color={secondary ? colors.mint : colors.background} />}
    {typeof children === 'string' ? <Button.Text style={{ color: secondary ? colors.text : colors.background, fontSize: 15, fontWeight: '700' }}>{children}</Button.Text> : children}
  </Button>;
}

export function Field({ label, ...props }: ComponentProps<typeof TextInput> & { label: string }) {
  return <View style={{ gap: 8 }}><Text style={styles.muted}>{label}</Text>
    <Input style={{ minHeight: 52, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background }}>
      <Input.Input {...props} accessibilityLabel={label} aria-label={label} placeholderTextColor={colors.muted} selectionColor={colors.mint}
        style={[{ color: colors.text, fontSize: 16, paddingHorizontal: 16, paddingVertical: 14, flex: 1 }, props.style]} />
    </Input>
  </View>;
}

export function Meter({ value, color = colors.mint, label }: { value: number; color?: string; label: string }) {
  return <Progress accessibilityLabel={label} value={Math.min(100, Math.max(0, value))} style={{ height: 7, borderRadius: 8, backgroundColor: colors.raised, overflow: 'hidden' }}>
    <Progress.FilledTrack style={{ height: 7, backgroundColor: color, borderRadius: 8 }} />
  </Progress>;
}

export function ErrorNotice({ message, retry }: { message: string; retry?: () => void }) {
  return <View accessibilityRole="alert" style={{ gap: 12, backgroundColor: '#321e26', padding: 16, borderRadius: 16 }}>
    <Text style={{ color: colors.danger, fontSize: 14, lineHeight: 21 }}>{message}</Text>
    {retry && <Action secondary onPress={retry}>Try again</Action>}
  </View>;
}

export function Loading({ label = 'Loading your diary…' }: { label?: string }) {
  return <View style={styles.center}><ActivityIndicator color={colors.mint} size="large" /><Text style={styles.muted}>{label}</Text></View>;
}

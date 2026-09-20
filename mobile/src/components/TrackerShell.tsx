import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BookOpen, ChevronDown, LayoutDashboard, LogOut, Plus, Settings, Settings2, Sparkles, TrendingUp, UserRound } from 'lucide-react-native';
import { useSession } from '../auth/Session';
import { Action, colors, isWeb, styles, useLayout } from './ui';

export type Tab = 'diary' | 'trends' | 'settings';
export function Brand() {
  return <View style={[styles.row, { gap: 11 }]}>
    <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: colors.mint, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#062018', fontSize: 22, fontWeight: '900' }}>N</Text>
    </View><Text style={{ color: colors.text, fontSize: 20, fontWeight: '700', letterSpacing: -.5 }}>Nourish</Text>
  </View>;
}

export function TrackerShell({ tab, onTab, onAdd, onGoals, children }: {
  tab: Tab; onTab: (tab: Tab) => void; onAdd: () => void; onGoals: () => void; children: ReactNode;
}) {
  const { desktop, width } = useLayout();
  const { name, email, signOut, busy } = useSession();
  const [accountOpen, setAccountOpen] = useState(false);
  useEffect(() => {
    if (!isWeb || !accountOpen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setAccountOpen(false);
        document.getElementById('account-menu-trigger')?.focus();
      }
    };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [accountOpen]);
  const tabs = [{ key: 'diary', label: isWeb ? 'Today' : 'Diary', Icon: isWeb ? LayoutDashboard : BookOpen },
    { key: 'trends', label: 'Trends', Icon: TrendingUp },
    ...(!isWeb ? [{ key: 'settings', label: 'Settings', Icon: Settings }] : [])] as const;
  const navigation = (sidebar: boolean) => tabs.map(({ key, label, Icon }) => <Pressable key={key}
    accessibilityRole="button" accessibilityLabel={`${key === 'diary' ? 'Diary' : label} tab${tab === key ? ', selected' : ''}`}
    accessibilityState={{ selected: tab === key }} onPress={() => onTab(key as Tab)}
    style={({ pressed }) => [{ flexDirection: sidebar ? 'row' : isWeb ? 'row' : 'column', alignItems: 'center', justifyContent: sidebar ? 'flex-start' : 'center',
      gap: sidebar ? 12 : 7, minHeight: 46, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 13,
      backgroundColor: tab === key ? '#15364a' : 'transparent', opacity: pressed ? .7 : 1,
      ...(sidebar ? { borderLeftWidth: 3, borderLeftColor: tab === key ? colors.mint : 'transparent' } : { flex: 1 }) }]}>
    <Icon size={19} color={tab === key ? colors.mint : colors.muted} />
    <Text style={{ color: tab === key ? colors.text : colors.muted, fontSize: sidebar ? 15 : 13, fontWeight: '600' }}>{label}</Text>
  </Pressable>);

  return <View style={{ flex: 1, flexDirection: 'row' }}>
    {desktop && <View style={{ width: 244, backgroundColor: '#091e2c', borderRightWidth: 1, borderColor: colors.border, padding: 20, paddingTop: 30 }}>
      <View style={{ paddingHorizontal: 8 }}><Brand /></View>
      <View role="navigation" accessibilityLabel="Main navigation" style={{ marginTop: 42, gap: 7 }}>{navigation(true)}</View>
      <View style={{ flex: 1 }} />
      <View style={{ padding: 17, gap: 8, borderRadius: 18, borderWidth: 1, borderColor: '#26495b', backgroundColor: '#102c3c', marginVertical: 20 }}>
        <Sparkles size={21} color={colors.mint} /><Text style={[styles.body, { fontWeight: '700', fontSize: 14 }]}>Stay consistent</Text>
        <Text style={[styles.muted, { fontSize: 12 }]}>Small choices, tracked daily, become visible progress.</Text>
      </View>
      <View style={{ borderTopWidth: 1, borderColor: colors.border, paddingTop: 12 }}><Action quiet secondary onPress={onGoals} style={{ justifyContent: 'flex-start', paddingHorizontal: 14 }}><Settings2 size={19} color={colors.muted} /><Text style={styles.muted}>Daily goals</Text></Action></View>
    </View>}
    <View style={{ flex: 1, minWidth: 0 }}>
      <View style={[styles.between, { height: desktop ? 104 : 88, paddingHorizontal: desktop ? Math.min(64, Math.max(28, width * .04)) : 18, borderBottomWidth: 1, borderColor: colors.border, zIndex: 3 }]}>
        {desktop ? <View style={{ gap: 5, flex: 1, minWidth: 0 }}><Text style={styles.eyebrow}>{tab === 'diary' ? 'DAILY DIARY' : 'NUTRITION ANALYTICS'}</Text><Text accessibilityRole="header" numberOfLines={1} style={[styles.title, { fontSize: 27 }]}>{tab === 'diary' ? 'Today’s fuel' : 'Your progress'}</Text></View> : <Brand />}
        {isWeb && <View style={[styles.row, { gap: desktop ? 16 : 8 }]}>
          <Action compact={!desktop} label="Add food" onPress={() => { setAccountOpen(false); onAdd(); }}><Plus size={19} color="#062018" />{width > 420 && <Text style={{ color: '#062018', fontWeight: '700' }}>Add food</Text>}</Action>
          <Pressable nativeID="account-menu-trigger" accessibilityRole="button" accessibilityLabel="Account menu" accessibilityState={{ expanded: accountOpen }} onPress={() => setAccountOpen(value => !value)}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: 12, borderRadius: 13, borderWidth: 1, borderColor: colors.border, backgroundColor: pressed || accountOpen ? colors.raised : 'transparent' })}>
            <UserRound size={16} color={colors.muted} />{desktop && width >= 1100 && <Text numberOfLines={1} style={[styles.body, { maxWidth: 160, fontSize: 13 }]}>{name}</Text>}<ChevronDown size={14} color={colors.muted} />
          </Pressable>
          {accountOpen && <View role="group" accessibilityLabel="Your account" style={{ position: 'absolute', top: 52, right: 0, width: 250, padding: 12, gap: 8, backgroundColor: '#10283a', borderWidth: 1, borderColor: colors.border, borderRadius: 13, boxShadow: '0 12px 36px #0008' }}>
            <Text numberOfLines={1} style={[styles.body, { fontWeight: '600' }]}>{name}</Text>{email && <Text numberOfLines={1} style={styles.muted}>{email}</Text>}
            <Action quiet secondary onPress={() => { setAccountOpen(false); onGoals(); }}><Settings2 size={16} color={colors.muted} /><Text style={styles.body}>Daily goals</Text></Action>
            <Action secondary busy={busy} onPress={() => void signOut()}><LogOut size={16} color={colors.muted} /><Text style={styles.body}>Sign out</Text></Action>
          </View>}
        </View>}
      </View>
      <View style={{ flex: 1, minHeight: 0 }}>{children}</View>
      {!desktop && <SafeAreaView edges={['bottom']} accessibilityRole="tablist" style={{ flexDirection: 'row', borderWidth: 1, borderColor: '#2d4b5f', backgroundColor: '#102a3a', padding: 6, gap: 6,
        ...(isWeb ? { position: 'absolute', bottom: 12, left: 12, right: 12, borderRadius: 17, boxShadow: '0 10px 40px #0009' } : {}) }}>{navigation(false)}</SafeAreaView>}
      {accountOpen && <Pressable accessible={false} tabIndex={-1} onPress={() => setAccountOpen(false)} style={{ position: 'absolute', top: desktop ? 104 : 88, left: 0, right: 0, bottom: 0, zIndex: 2 }} />}
    </View>
  </View>;
}

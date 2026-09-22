import type { ReactNode } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BookOpen, LayoutDashboard, Plus, Settings, Settings2, Sparkles, TrendingUp } from 'lucide-react-native';
import { Action, colors, isWeb, styles, useLayout } from './ui';
import gramelloMark from '../../assets/gramello-mark.png';

export type Tab = 'diary' | 'trends' | 'settings';
export function Brand() {
  return <View style={[styles.row, { gap: 11 }]}>
    <Image source={gramelloMark} alt="" accessible={false} style={{ width: 44, height: 44, borderRadius: 12 }} />
    <Text style={{ color: colors.text, fontSize: 20, fontWeight: '700', letterSpacing: -.5 }}>Gramello</Text>
  </View>;
}

export function TrackerShell({ tab, onTab, onAdd, onGoals, children }: {
  tab: Tab; onTab: (tab: Tab) => void; onAdd: () => void; onGoals: () => void; children: ReactNode;
}) {
  const { desktop, width } = useLayout();
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
          <Action compact={!desktop} label="Add food" onPress={onAdd}><Plus size={19} color="#062018" />{width > 420 && <Text style={{ color: '#062018', fontWeight: '700' }}>Add food</Text>}</Action>
          {!desktop && <Action compact secondary label="Daily goals" onPress={onGoals}><Settings2 size={19} color={colors.muted} /></Action>}
        </View>}
      </View>
      <View style={{ flex: 1, minHeight: 0 }}>{children}</View>
      {!desktop && <SafeAreaView edges={['bottom']} accessibilityRole="tablist" style={{ flexDirection: 'row', borderWidth: 1, borderColor: '#2d4b5f', backgroundColor: '#102a3a', padding: 6, gap: 6,
        ...(isWeb ? { position: 'absolute', bottom: 12, left: 12, right: 12, borderRadius: 17, boxShadow: '0 10px 40px #0009' } : {}) }}>{navigation(false)}</SafeAreaView>}
    </View>
  </View>;
}

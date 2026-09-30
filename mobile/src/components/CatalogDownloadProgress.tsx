import { useSyncExternalStore } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import type { CatalogUpdater, UpdateStatus } from '../catalog/updater';
import { catalogDownloadProgress } from '../catalog/progress';
import { colors, styles } from './ui';

export function CatalogDownloadProgress({ status }: { status: UpdateStatus }) {
  const { active, percent, label } = catalogDownloadProgress(status);
  if (!active) return null;
  return <View style={{ gap: 8 }}>
    <View style={styles.between}>
      <View style={[styles.row, { gap: 7, flex: 1 }]}>
        {percent === undefined && <ActivityIndicator color={colors.mint} size="small" />}
        <Text style={[styles.muted, { flexShrink: 1 }]}>{label}</Text>
      </View>
      {percent !== undefined && <Text style={[styles.muted, { color: colors.mint }]}>{percent}%</Text>}
    </View>
    <View accessible accessibilityRole="progressbar" accessibilityLabel="Food catalog download progress"
      accessibilityValue={percent === undefined ? { text: label } : { min: 0, max: 100, now: percent, text: `${percent}%` }}
      style={{ height: 7, borderRadius: 8, backgroundColor: colors.raised, overflow: 'hidden' }}>
      <View style={{ height: '100%', width: percent === undefined ? '35%' : `${percent}%`, backgroundColor: colors.mint, borderRadius: 8 }} />
    </View>
  </View>;
}

export function CatalogDownloadIndicator({ updater }: { updater: CatalogUpdater }) {
  const status = useSyncExternalStore(updater.subscribe, updater.getStatus, updater.getStatus);
  const { active, percent, label } = catalogDownloadProgress(status);
  if (!active) return null;
  const circumference = 2 * Math.PI * 17;
  return <View accessible accessibilityRole="progressbar" accessibilityLabel="Food catalog download progress"
    accessibilityValue={percent === undefined ? { text: label } : { min: 0, max: 100, now: percent, text: `${percent}%. ${label}` }}
    style={{ width: 40, height: 40, justifyContent: 'center', alignItems: 'center' }}>
    {percent === undefined ? <ActivityIndicator color={colors.mint} size="small" /> : <>
      <Svg width={40} height={40} viewBox="0 0 40 40" style={{ position: 'absolute' }}>
        <Circle cx={20} cy={20} r={17} stroke={colors.raised} strokeWidth={3} fill="none" />
        <Circle cx={20} cy={20} r={17} stroke={colors.mint} strokeWidth={3} fill="none" strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`} strokeDashoffset={circumference * (1 - percent / 100)} rotation={-90} origin="20, 20" />
      </Svg>
      <Text accessible={false} style={{ color: colors.mint, fontSize: 10, fontWeight: '700' }}>{percent}%</Text>
    </>}
  </View>;
}

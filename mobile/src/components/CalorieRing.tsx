import { View, Text } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { colors, styles } from './ui';

export function CalorieRing({ consumed, goal, size = 164 }: { consumed: number; goal: number; size?: number }) {
  const circumference = 2 * Math.PI * 70;
  const progress = goal > 0 ? Math.min(1, consumed / goal) : 0;
  return <View accessible accessibilityLabel={`${Math.round(consumed)} of ${Math.round(goal)} calories logged`} style={{ width: size, height: size, alignSelf: 'center', justifyContent: 'center', alignItems: 'center' }}>
    <Svg width={size} height={size} viewBox="0 0 164 164" style={{ position: 'absolute' }}>
      <Circle cx={82} cy={82} r={70} stroke={colors.raised} strokeWidth={10} fill="none" />
      <Circle cx={82} cy={82} r={70} stroke={colors.mint} strokeWidth={10} fill="none" strokeLinecap="round"
        strokeDasharray={`${circumference} ${circumference}`} strokeDashoffset={circumference * (1 - progress)} rotation={-90} origin="82, 82" />
    </Svg>
    <Text style={{ color: colors.text, fontSize: size < 140 ? 25 : 32, fontWeight: '700', letterSpacing: -1 }}>{Math.round(Math.max(0, goal - consumed)).toLocaleString()}</Text>
    <Text style={styles.muted}>cal left</Text>
  </View>;
}

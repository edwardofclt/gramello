import { Text } from 'react-native';
import { colors } from './ui';
export function FoodVerification({ verified }: { verified?: boolean }) {
  return <Text style={{ color: verified ? colors.mint : colors.amber, fontSize: 11, fontWeight: '600' }}
    accessibilityLabel={verified ? 'Verified nutrition source' : 'Unverified nutrition'}>{verified ? '✓ Verified' : 'Unverified'}</Text>;
}

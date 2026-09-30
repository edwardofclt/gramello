import { useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Check, ChevronDown } from 'lucide-react-native';
import { colors, styles } from './ui';

export function BrandFilter({ brands, value, onChange }: { brands: string[]; value: string; onChange: (brand: string) => void }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<View>(null);
  const options = ['', ...Array.from(new Set([...brands, ...(value ? [value] : [])]))];
  const label = value || 'All brands and restaurants';
  return <View style={{ gap: 8 }}>
    <Text style={styles.eyebrow}>BRAND OR RESTAURANT</Text>
    <Pressable ref={trigger} accessibilityRole="button" accessibilityLabel={`Brand or restaurant: ${label}`} accessibilityState={{ expanded: open }}
      onPress={() => setOpen(previous => !previous)}
      style={[styles.between, { minHeight: 48, padding: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.raised }]}>
      <Text style={[styles.body, { flex: 1 }]}>{label}</Text><ChevronDown color={colors.mint} size={18} />
    </Pressable>
    {open && <ScrollView accessibilityRole="radiogroup" accessibilityLabel="Brand or restaurant" nestedScrollEnabled keyboardShouldPersistTaps="handled"
      style={{ maxHeight: 240, borderWidth: 1, borderColor: colors.border, borderRadius: 12 }}>
      {options.map(brand => <Pressable key={brand} accessibilityRole="radio" accessibilityLabel={brand || 'All brands and restaurants'} accessibilityState={{ checked: value === brand }}
        onPress={() => { onChange(brand); setOpen(false); trigger.current?.focus(); }}
        style={[styles.between, { minHeight: 48, padding: 14, backgroundColor: value === brand ? colors.raised : colors.background }]}>
        <Text style={[styles.body, { flex: 1, color: value === brand ? colors.mint : colors.text }]}>{brand || 'All brands and restaurants'}</Text>
        {value === brand && <Check color={colors.mint} size={18} />}
      </Pressable>)}
    </ScrollView>}
  </View>;
}

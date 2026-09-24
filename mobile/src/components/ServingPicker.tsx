import { useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Check, ChevronDown } from 'lucide-react-native';
import type { Food } from '../../../lib/food';
import { foodServingOptions, selectedFoodServingId, selectFoodServing } from '../../../lib/serving-options';
import { colors, styles } from './ui';

export function ServingPicker({ food, onChange, disabled }: { food: Food; onChange: (food: Food) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<View>(null);
  const options = foodServingOptions(food), selected = selectedFoodServingId(food);
  if (options.length < 2) return null;
  return <View style={{ gap: 8 }}>
    <Text style={styles.muted}>Serving size</Text>
    <Pressable ref={trigger} accessibilityRole="button" accessibilityLabel={`Serving size: ${food.servingLabel}`} accessibilityState={{ expanded: open, disabled }}
      disabled={disabled} onPress={() => setOpen(value => !value)}
      style={[styles.between, { minHeight: 48, padding: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.raised }]}>
      <Text style={[styles.body, { flex: 1 }]}>{food.servingLabel}</Text><ChevronDown color={colors.mint} size={18} />
    </Pressable>
    {open && <ScrollView accessibilityRole="radiogroup" accessibilityLabel="Serving size" nestedScrollEnabled keyboardShouldPersistTaps="handled" style={{ maxHeight: 240, borderWidth: 1, borderColor: colors.border, borderRadius: 12 }}>
      {options.map(option => <Pressable key={option.id} accessibilityRole="radio" accessibilityLabel={option.label}
        accessibilityState={{ checked: selected === option.id, disabled }} disabled={disabled}
        onPress={() => { const next = selectFoodServing(food, option.id); if (next) { onChange(next); setOpen(false); trigger.current?.focus(); } }}
        style={[styles.between, { minHeight: 48, padding: 14, backgroundColor: selected === option.id ? colors.raised : colors.background }]}>
        <Text style={[styles.body, { flex: 1, color: selected === option.id ? colors.mint : colors.text }]}>{option.label}</Text>{selected === option.id && <Check color={colors.mint} size={18} />}
      </Pressable>)}
    </ScrollView>}
  </View>;
}

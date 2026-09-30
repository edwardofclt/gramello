import { packSchema, type FoodPack } from '../../mobile/src/catalog/packs';
export type PackEntry = { format: 1; pack: FoodPack; location: 'indexeddb' | 'opfs' };
export function decodePackEntries(values: unknown = []): PackEntry[] {
  if (!Array.isArray(values)) return [];
  return values.flatMap(value => {
    if (value?.format === 1) {
      const parsed = packSchema.safeParse(value.pack);
      return parsed.success && (value.location === 'indexeddb' || value.location === 'opfs') ? [{ format: 1 as const, pack: parsed.data, location: value.location as PackEntry['location'] }] : [];
    }
    const parsed = packSchema.safeParse(value);
    return parsed.success ? [{ format: 1 as const, pack: parsed.data, location: 'indexeddb' as const }] : [];
  });
}

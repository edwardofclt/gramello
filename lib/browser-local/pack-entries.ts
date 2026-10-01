import { packSchema, type FoodPack } from '../../mobile/src/catalog/packs';
import type { PackFileStamp } from '../../mobile/src/catalog/pack-verification';
export type PackEntry = { format: 1; pack: FoodPack; location: 'indexeddb' | 'opfs'; stamp?: PackFileStamp };
export function decodePackEntries(values: unknown = []): PackEntry[] {
  if (!Array.isArray(values)) return [];
  return values.flatMap(value => {
    if (value?.format === 1) {
      const parsed = packSchema.safeParse(value.pack);
      if (!parsed.success || (value.location !== 'indexeddb' && value.location !== 'opfs')) return [];
      const stamp = value.stamp;
      if (stamp !== undefined && (!Number.isInteger(stamp?.bytes) || stamp.bytes !== parsed.data.bytes
        || (stamp.modifiedAt !== null && !Number.isFinite(stamp.modifiedAt)))) return [];
      return [{ format: 1 as const, pack: parsed.data, location: value.location as PackEntry['location'], ...(stamp ? { stamp: stamp as PackFileStamp } : {}) }];
    }
    const parsed = packSchema.safeParse(value);
    return parsed.success ? [{ format: 1 as const, pack: parsed.data, location: 'indexeddb' as const }] : [];
  });
}

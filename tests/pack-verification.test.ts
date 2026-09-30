import { expect, it } from 'vitest';
import { createPackVerification } from '../mobile/src/catalog/pack-verification';
import type { FoodPack } from '../mobile/src/catalog/packs';
it('bounds metadata verification history while retaining recent warm entries', async () => {
  const cache = createPackVerification(); let hashes = 0;
  const pack = (index: number) => ({ sha256: index.toString(16).padStart(64, '0'), bytes: 4096 } as FoodPack);
  const stamp = { bytes: 4096, modifiedAt: 1000 };
  const verify = (index: number) => cache.verify(pack(index), stamp, async () => { hashes++; return pack(index).sha256; });
  for (let index = 0; index < 1025; index++) await verify(index);
  await verify(0); expect(hashes).toBe(1026);
  await verify(1024); expect(hashes).toBe(1026);
});

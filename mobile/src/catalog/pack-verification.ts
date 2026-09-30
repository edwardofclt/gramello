import type { FoodPack } from './packs';
export type PackFileStamp = { bytes: number; modifiedAt: number | null };
export function createPackVerification() {
  const accepted = new Map<string, string>();
  return {
    async verify(pack: FoodPack, stamp: PackFileStamp, digest: () => Promise<string>, force = false): Promise<boolean> {
      const cacheable = Number.isFinite(stamp.modifiedAt) && (stamp.modifiedAt ?? 0) > 0;
      const token = `${pack.bytes}:${stamp.bytes}:${stamp.modifiedAt}`;
      if (stamp.bytes !== pack.bytes) { accepted.delete(pack.sha256); return false; }
      if (!force && cacheable && accepted.get(pack.sha256) === token) {
        accepted.delete(pack.sha256); accepted.set(pack.sha256, token); return true;
      }
      accepted.delete(pack.sha256);
      if (await digest() !== pack.sha256) return false;
      if (cacheable) {
        accepted.set(pack.sha256, token);
        // At most 512 active packs plus one native previous generation.
        if (accepted.size > 1024) accepted.delete(accepted.keys().next().value!);
      }
      return true;
    },
    invalidate(hash: string) { accepted.delete(hash); },
  };
}

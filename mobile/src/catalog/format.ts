import { z } from 'zod';
import nacl from 'tweetnacl';
const https = z.string().url().refine(value => new URL(value).protocol === 'https:' && !new URL(value).username && !new URL(value).password);
export const manifestSchema = z.object({
  schemaVersion: z.literal(1), version: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/), publishedAt: z.string().datetime(),
  url: https, bytes: z.number().int().min(4096).max(128 * 1024 * 1024), sha256: z.string().regex(/^[a-f0-9]{64}$/), count: z.number().int().positive().max(1000000),
});
export type CatalogManifest = z.infer<typeof manifestSchema>;
export function hexBytes(value: string, length: number) {
  if (!new RegExp(`^[a-fA-F0-9]{${length * 2}}$`).test(value)) throw new Error('Invalid catalog signature or signing key.');
  return Uint8Array.from(value.match(/../g)!, pair => parseInt(pair,16));
}
export function verifyManifest(value: unknown, publicKey: string): CatalogManifest {
  if (!publicKey) throw new Error('Catalog updates are not configured in this build.');
  const envelope = z.object({ payload: z.string().max(16384), signature: z.string() }).parse(value);
  if (!nacl.sign.detached.verify(new TextEncoder().encode(envelope.payload), hexBytes(envelope.signature,64), hexBytes(publicKey,32))) throw new Error('The catalog signature could not be verified.');
  const result = manifestSchema.safeParse(JSON.parse(envelope.payload));
  if (!result.success) throw new Error('This catalog needs a different app version or has invalid metadata.');
  return result.data;
}

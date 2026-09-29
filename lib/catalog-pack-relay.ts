import config from '../mobile/catalog-config.json';
import { verifyPackManifest } from '../mobile/src/catalog/packs';

export async function packEnvelope(signal: AbortSignal) {
  const response = await fetch(config.packManifestUrl, { signal, headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('US product downloads are unavailable. Installed foods still work.');
  const text = await response.text();
  if (text.length > 520000) throw new Error('Pack manifest is too large.');
  const envelope: unknown = JSON.parse(text);
  return { envelope, manifest: verifyPackManifest(envelope, config.publicKey) };
}

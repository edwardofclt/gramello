import config from '../mobile/catalog-config.json';
import { verifyPackManifest } from '../mobile/src/catalog/packs';
import { readPackManifestResponse } from '../mobile/src/catalog/downloads';

export async function packEnvelope(signal: AbortSignal) {
  const response = await fetch(config.packManifestUrl, { signal, headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('US product downloads are unavailable. Installed foods still work.');
  const envelope = await readPackManifestResponse(response);
  return { envelope, manifest: verifyPackManifest(envelope, config.publicKey) };
}

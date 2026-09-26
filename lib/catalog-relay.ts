import config from '../mobile/catalog-config.json';
import { verifyManifest } from '../mobile/src/catalog/format';

export async function catalogEnvelope(signal: AbortSignal) {
  const response = await fetch(config.manifestUrl, { signal, headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('Catalog updates are temporarily unavailable. Installed foods still work.');
  const text = await response.text();
  if (text.length > 20000) throw new Error('Catalog manifest is too large.');
  const envelope: unknown = JSON.parse(text);
  const manifest = verifyManifest(envelope, config.publicKey);
  return { envelope, manifest };
}

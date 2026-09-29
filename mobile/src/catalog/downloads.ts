export type DownloadResponse = Pick<Response, 'ok' | 'body'>;
export type DownloadBounds = { maxBytes: number; exactBytes?: number };

export async function consumeBoundedResponse(response: DownloadResponse, bounds: DownloadBounds,
  write: (chunk: Uint8Array<ArrayBuffer>) => void | Promise<void>): Promise<number> {
  if (!Number.isSafeInteger(bounds.maxBytes) || bounds.maxBytes <= 0
    || (bounds.exactBytes !== undefined && (!Number.isSafeInteger(bounds.exactBytes)
      || bounds.exactBytes <= 0 || bounds.exactBytes > bounds.maxBytes))) throw new Error('Invalid download size.');
  if (!response.ok || !response.body) throw new Error('The food pack could not be downloaded.');
  const reader = response.body.getReader();
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      if (size + value.byteLength > bounds.maxBytes) throw new Error('Download exceeds its signed size.');
      size += value.byteLength;
      await write(value);
    }
    if (bounds.exactBytes !== undefined && size !== bounds.exactBytes) throw new Error('Download is incomplete.');
    return size;
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally { reader.releaseLock(); }
}
async function readBytes(response: DownloadResponse, bounds: DownloadBounds): Promise<Uint8Array<ArrayBuffer>> {
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  const size = await consumeBoundedResponse(response, bounds, chunk => { chunks.push(chunk); });
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}
export async function readPackManifestResponse(response: DownloadResponse): Promise<unknown> {
  return JSON.parse(new TextDecoder().decode(await readBytes(response, { maxBytes: 520000 })));
}
export async function readPackResponse(response: DownloadResponse, expectedBytes: number): Promise<Uint8Array<ArrayBuffer>> {
  if (!Number.isSafeInteger(expectedBytes) || expectedBytes < 4096 || expectedBytes > 32 * 1024 * 1024) throw new Error('Invalid pack size.');
  return readBytes(response, { maxBytes: expectedBytes, exactBytes: expectedBytes });
}

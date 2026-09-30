import { describe, expect, it } from 'vitest';
import { consumeBoundedResponse, readPackManifestResponse, readPackResponse } from '../mobile/src/catalog/downloads';
describe('bounded pack responses', () => {
  it('does not write an overflowing chunk and releases the stream', async () => {
    let cancelled = false;
    const written: number[] = [];
    const body = new ReadableStream({ start(c) { c.enqueue(new Uint8Array(4096)); c.enqueue(new Uint8Array(1)); }, cancel() { cancelled = true; } });
    await expect(consumeBoundedResponse(new Response(body), { maxBytes: 4096, exactBytes: 4096 }, b => { written.push(b.length); })).rejects.toThrow('exceeds');
    expect(written).toEqual([4096]); expect(cancelled).toBe(true); expect(body.locked).toBe(false);
  });
  it('reports only bytes accepted by the bounded sink', async () => {
    const progress: number[] = [];
    const body = new ReadableStream({ start(c) {
      c.enqueue(new Uint8Array(2048)); c.enqueue(new Uint8Array(2048)); c.enqueue(new Uint8Array(1));
    } });
    await expect(readPackResponse(new Response(body), 4096, bytes => progress.push(bytes))).rejects.toThrow('exceeds');
    expect(progress).toEqual([2048, 4096]);
  });
  it('rejects truncation', async () => {
    await expect(readPackResponse(new Response(new Uint8Array(4095)), 4096)).rejects.toThrow('incomplete');
  });
  it('counts UTF-8 bytes, not characters', async () => {
    await expect(readPackManifestResponse(new Response('é'.repeat(260001)))).rejects.toThrow('exceeds');
    expect(await readPackManifestResponse(Response.json({ name: 'é' }))).toEqual({ name: 'é' });
  });
  it('cancels when a file sink fails', async () => {
    let cancelled = false;
    const body = new ReadableStream({ start(c) { c.enqueue(new Uint8Array(1)); }, cancel() { cancelled = true; } });
    await expect(consumeBoundedResponse(new Response(body), { maxBytes: 4 }, () => { throw new Error('quota'); })).rejects.toThrow('quota');
    expect(cancelled).toBe(true); expect(body.locked).toBe(false);
  });
  it('propagates a stream failure and releases its lock', async () => {
    const body = new ReadableStream({ start(c) { c.error(new Error('network')); } });
    await expect(consumeBoundedResponse(new Response(body), { maxBytes: 4 }, () => {})).rejects.toThrow('network');
    expect(body.locked).toBe(false);
  });
  it.each([0, -1, NaN, 1.5, Infinity])('rejects invalid size %s', async maxBytes => {
    await expect(consumeBoundedResponse(new Response('x'), { maxBytes }, () => {})).rejects.toThrow('Invalid');
  });
});

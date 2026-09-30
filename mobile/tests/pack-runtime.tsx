// Simulator-only entry: never imported by the production application.
import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import { fetch } from 'expo/fetch';
import { createNativePackStorage } from '../src/catalog/native-packs';
import { createPackCatalog } from '../src/catalog/pack-reader';
import { createPackUpdater, verifyPackManifest, type FoodPack } from '../src/catalog/packs';

const origin = 'http://127.0.0.1:5199';
const prefix = 'gramello:pack-runtime:';
const metadata = async <T,>(key: string): Promise<T | null> => {
  const value = await AsyncStorage.getItem(prefix + key); return value ? JSON.parse(value) : null;
};
const save = async (key: string, value: unknown) => AsyncStorage.setItem(prefix + key, JSON.stringify(value));
const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };
const report = async (stage: string, details: unknown) => {
  await fetch(origin + '/native-report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stage, details }) });
};

async function run(status: (message: string) => void) {
  if (!__DEV__) throw new Error('The pack runtime fixture requires a development client.');
  const phase = await metadata<string>('phase'), restart = phase === 'restart';
  let fixture = await metadata<{ publicKey: string; packs: FoodPack[] }>('fixture');
  if (!phase) {
    const directory = new Directory(Paths.document, 'gramello-food-packs');
    assert(!directory.exists || !directory.list().some(file => file instanceof File && file.name.endsWith('.sqlite')),
      'Use a fresh isolated simulator. Existing pack files will not be erased.');
    const publicKey = (await (await fetch(origin + '/fixture.json')).json()).publicKey as string;
    const envelope = await (await fetch(origin + '/api/catalog/packs/manifest')).json();
    fixture = { publicKey, packs: verifyPackManifest(envelope, publicKey).packs }; await save('fixture', fixture);
  }
  assert(fixture, 'Missing persisted fixture.');
  let offline = restart, downloads = 0, reads = 0;
  const fixtureFetch: typeof fetch = async (input, init) => {
    if (offline) throw new Error('Fixture transport is offline.');
    const url = String(input), pack = fixture!.packs.find(pack => pack.url === url);
    if (pack) downloads++;
    return fetch(pack ? (!phase ? origin + '/native-interrupt' : origin + '/api/catalog/packs/download?' + new URLSearchParams({ id: pack.id, sha256: pack.sha256 })) : url, init);
  };
  const originalBytes = File.prototype.bytes;
  File.prototype.bytes = async function () { if (/^pack-[a-f0-9]{64}\.sqlite$/.test(this.name)) reads++; return originalBytes.call(this); };
  try {
    const storage = await createNativePackStorage(metadata, save, origin + '/api/catalog/packs/manifest', { fetcher: fixtureFetch });
    const directory = new Directory(Paths.document, 'gramello-food-packs');
    if (!phase) {
      await save('phase', 'interrupted');
      void storage.install(fixture!.packs[0]).catch(() => {});
      const deadline = Date.now() + 10000;
      while (!directory.list().some(file => file instanceof File && file.name.endsWith('.partial') && file.size === 4096)) {
        if (Date.now() > deadline) throw new Error('Interrupted fixture did not stream its first chunk.');
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      status('Terminate ready'); await report('interrupted-transfer-ready', { temporaryBytes: 4096 }); return;
    }
    if (phase === 'interrupted') {
      assert(directory.list().some(file => file.name.endsWith('.partial')), 'Missing abandoned transfer fixture.');
      await storage.recover!();
      assert(!directory.list().some(file => file.name.endsWith('.partial')), 'Abandoned transfer was not recovered.');
    }
    let opened = 0;
    const catalog = createPackCatalog(storage.list, (pack, work) => { opened++; return storage.withReader(pack, work); },
      { getFood: async () => null, search: async () => [], barcode: async () => null }, storage.routes);
    if (restart) {
      status('Checking restarted offline USDA route…');
      assert((await catalog.getFood('usda-1892562'))?.id === 'usda-1892562', 'Restarted USDA lookup failed.');
      assert(opened === 1, 'Restarted lookup scanned extra nutrition packs.');
      assert((await catalog.barcode('030771094625'))?.id === 'usda-1892562', 'Offline barcode precedence failed.');
      assert((await catalog.searchWindow!('al fresco apple maple sausage')).foods.length === 2, 'Offline expansion search failed.');
      assert(downloads === 0, 'Offline reads unexpectedly downloaded data.');
      await save('phase', 'complete'); status('Native checks passed');
      await report('complete', { restartedRouteOpens: 1, offlineDownloads: downloads, foods: 2 }); return;
    }
    status('Checking signed-size transfer bounds…');
    let overflow = false;
    try { await storage.install({ ...fixture!.packs[0], bytes: fixture!.packs[0].bytes - 1 }); }
    catch (error) { overflow = /exceed|size|incomplete/i.test(String(error)); }
    assert(overflow, 'An oversized response was not rejected.');
    assert((await storage.list()).length === 0, 'Failed transfer activated a pack.');
    assert(!directory.list().some(file => file.name.endsWith('.partial')), 'Failed temporary transfer was retained.');
    status('Installing the signed Al Fresco fixtures…');
    const updater = createPackUpdater(storage, fixture!.publicKey); await updater.check(true);
    assert(updater.getStatus().phase === 'updated', JSON.stringify(updater.getStatus()));
    await catalog.searchWindow!('al fresco apple maple sausage'); reads = 0;
    for (let pass = 0; pass < 2; pass++) assert((await catalog.searchWindow!('al fresco apple maple sausage')).foods.length === 2, 'Warm search failed.');
    assert(reads === 0, 'Warm native searches rehashed full pack files.');
    const warmHashes = reads;
    const pack = fixture!.packs.find(pack => pack.source === 'off')!;
    const file = new File(directory, `pack-${pack.sha256}.sqlite`);
    file.write(new Uint8Array(pack.bytes).fill(255));
    const beforeRepair = downloads; await storage.install(pack);
    assert(downloads === beforeRepair + 1, 'Corruption was not repaired in one download.');
    assert((await storage.withReader(pack, reader => reader.getFood('off-0030771094625')))?.id === 'off-0030771094625', 'Repaired food is unreadable.');
    offline = true; assert((await catalog.searchWindow!('al fresco apple maple sausage')).foods.length === 2, 'Installed foods need a network.');
    await save('phase', 'restart'); status('Restart ready');
    await report('restart-ready', { abandonedTransferRecovery: true, boundedTransfer: true, temporaryCleanup: true, warmHashes, repairDownloads: downloads - beforeRepair, foods: 2 });
  } finally { File.prototype.bytes = originalBytes; }
}

export default function PackRuntime() {
  const [message, setMessage] = useState('Starting native pack checks…');
  useEffect(() => { run(setMessage).catch(async error => { setMessage('FAILED: ' + String(error)); await report('failed', String(error)); }); }, []);
  return <View style={{ flex: 1, padding: 32, paddingTop: 100, backgroundColor: '#f4f6ef' }}><Text style={{ fontSize: 22 }}>{message}</Text><Text style={{ marginTop: 20 }}>Isolated Al Fresco pack fixture</Text></View>;
}

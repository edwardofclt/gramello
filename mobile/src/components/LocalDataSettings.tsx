import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Text, View } from 'react-native';
import type { LocalServices } from '../local/services';
import type { Archive } from '../local/records';
import { Action, Card, ErrorNotice, styles } from './ui';
import { AppDialog } from './AppDialog';

export function LocalDataSettings({ local }: { local: LocalServices }) {
  const status = useSyncExternalStore(local.updater.subscribe,local.updater.getStatus,local.updater.getStatus);
  const [busy,setBusy] = useState(false), [error,setError] = useState('');
  const [pending,setPending] = useState<{text:string;archive:Archive} | null>(null);
  const [recovery,setRecovery] = useState(false), [restoring,setRestoring] = useState(false);
  const lock = useRef(false);
  useEffect(() => { let current = true; void local.repository.hasRecovery().then(value => { if(current) setRecovery(value); }).catch(() => { if(current) setError('Recovery information could not be read.'); }); return () => { current = false; }; },[local.repository]);
  async function run(work: () => Promise<void>) {
    if(lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try { await work(); } catch(error) { setError(error instanceof Error ? error.message : 'The file operation could not finish.'); }
    finally { lock.current = false; setBusy(false); }
  }
  return <>
    <Card><Text style={styles.heading}>Food catalog</Text>
      <Text style={styles.muted}>Food information downloads and updates automatically. Your diary stays on this device.</Text>
      <Text style={styles.muted}>{status.version ? `Installed: ${status.version}` : 'Bundled USDA catalog'}{status.lastCheck ? `\nLast checked: ${new Date(status.lastCheck).toLocaleString()}` : ''}</Text>
      <Text accessibilityLiveRegion="polite" style={styles.body}>{status.phase === 'checking' ? 'Checking for updates…' : status.phase === 'downloading' ? 'Downloading food information…' : status.phase === 'updated' ? 'Food catalog updated.' : status.phase === 'current' ? 'Your food catalog is up to date.' : 'Installed foods are available offline.'}</Text>
      {status.error && <ErrorNotice message={status.error} />}
      <Action secondary busy={status.phase === 'checking' || status.phase === 'downloading'} onPress={() => void local.updater.check(true)}>Check for updates</Action>
      <Text style={styles.muted}>USDA FoodData Central · CC0 public-domain data. The starter catalog contains SR Legacy foods. Barcode coverage depends on the installed catalog.</Text>
    </Card>
    <Card><Text style={styles.heading}>Your data</Text>
      <Text style={styles.muted}>Saved on this device. Export a backup to keep a copy or move to another device. Choose where to save it using your device’s file sharing options.</Text>
      <Action secondary busy={busy} onPress={() => void run(() => local.exportFile('backup'))}>Export backup</Action>
      <View style={{gap:10}}><Action secondary disabled={busy} onPress={() => void run(() => local.exportFile('diary'))}>Export diary CSV</Action><Action secondary disabled={busy} onPress={() => void run(() => local.exportFile('water'))}>Export water CSV</Action></View>
      <Text style={styles.muted}>Exported files are readable by anyone who has access to them. CSV is for spreadsheets; use a Gramello backup to restore your complete diary.</Text>
      <Action secondary disabled={busy} onPress={() => void run(async () => { const next = await local.pickImport(); if(next) setPending(next); })}>Import backup</Action>
      {recovery && <Action secondary disabled={busy} onPress={() => setRestoring(true)}>Recover previous diary</Action>}
      {error && !pending && !restoring && <ErrorNotice message={error} />}
    </Card>
    {(pending || restoring) && <AppDialog title={restoring ? 'Recover previous diary?' : 'Replace this diary?'} description="Import replaces the personal data on this device." busy={busy} onClose={() => { setPending(null);setRestoring(false); }}>
      {pending && <Text style={styles.body}>Backup from {new Date(pending.archive.exportedAt).toLocaleString()} · {pending.archive.records.length} records.</Text>}
      <Text style={styles.muted}>This replaces your diary, recipes, custom foods, water history, and goals. The current diary is kept as a recovery copy. Food catalogs are unaffected.</Text>
      {error && <ErrorNotice message={error} />}
      <Action busy={busy} onPress={() => void run(async () => { if(restoring) await local.restorePrevious(); else if(pending) await local.importFile(pending.text); setPending(null);setRestoring(false); })}>{restoring ? 'Recover diary' : 'Replace and import'}</Action>
      <Action secondary disabled={busy} onPress={() => { setPending(null);setRestoring(false); }}>Cancel</Action>
    </AppDialog>}
  </>;
}

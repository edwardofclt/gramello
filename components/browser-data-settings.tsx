'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Database, Download, RefreshCw, Upload } from 'lucide-react';
import type { BrowserRuntime } from '@/lib/browser-local/client';
import { downloadFile, readHostedBackup } from '@/lib/browser-startup';
import { MAX_ARCHIVE_BYTES, parseArchive, type Archive } from '@/mobile/src/local/records';
import { useWater } from '@/lib/use-water';
import { localDate } from '@/lib/diary-date';
import { WaterGoalEditor } from './water-tracker';
import { CatalogDownloadProgress } from './catalog-download-progress';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';

export function BrowserDataSettings({ runtime, offlineStatus, onReplaced, onGoals, onOfflineRetry }: {
  runtime: BrowserRuntime; offlineStatus: string; onReplaced: () => void; onGoals: () => void; onOfflineRetry?: () => void;
}) {
  const status = useSyncExternalStore(runtime.updater.subscribe, runtime.updater.getStatus, runtime.updater.getStatus);
  const water = useWater(runtime.api, localDate());
  const input = useRef<HTMLInputElement>(null);
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState<{ text: string; archive: Archive } | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [recovery, setRecovery] = useState(false);
  useEffect(() => { let active = true; void runtime.repository.hasRecovery().then(value => { if (active) setRecovery(value); }).catch(() => { if (active) setError('Recovery information could not be read.'); }); return () => { active = false; }; }, [runtime]);

  async function run(work: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(''); setMessage('');
    try { await work(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'The file operation could not finish.'); }
    finally { lock.current = false; setBusy(false); }
  }
  const close = () => { if (!busy) { setPending(null); setRestoring(false); setError(''); } };

  return <section className="page-content data-settings">
    <div><span className="eyebrow">MAKE IT YOURS</span><h2>Settings</h2><p>Your targets, food catalog, and saved data.</p></div>
    <section className="settings-card"><h3>Daily targets</h3><Button variant="outline" onClick={onGoals}>Edit calorie and macro goals</Button>
      <h3>Water goal</h3>{water.data ? <WaterGoalEditor goal={water.data.goal} busy={water.busy} error={water.error} onSave={async goal => { if (await water.saveGoal(goal)) setMessage('Water goal saved.'); }} /> : <p>{water.error || 'Loading your water goal…'}</p>}
    </section>
    <section className="settings-card"><h3><Database size={20} />Offline access</h3><p role="status" data-testid="offline-status">{offlineStatus}</p>
      {onOfflineRetry && !['Ready to use offline', 'Preparing offline access…'].includes(offlineStatus) && <Button variant="outline" onClick={onOfflineRetry}>Retry offline setup</Button>}
      <p>Your diary and custom foods stay in this browser. After offline setup finishes, you can reopen the app and use downloaded foods without a connection.</p>
      <p>Clearing this site’s browser data removes its local diary. Export a backup to keep a copy or move between web, iOS, and Android. Diaries do not sync automatically.</p>
    </section>
    <section className="settings-card"><h3>Food catalog</h3><p>US-market USDA branded products and Open Food Facts download automatically, including cellular connections. The starter foods and restaurant menus remain available.</p>
      {status.version && <p>Installed: {status.version}</p>}{status.lastCheck && <p>Last checked: {new Date(status.lastCheck).toLocaleString()}</p>}
      {status.phase !== 'checking' && status.phase !== 'downloading' && <p aria-live="polite">{status.phase === 'updated' ? 'Food catalog updated.' : status.phase === 'current' ? 'Your food catalog is up to date.' : 'Bundled and cached foods remain available when an update fails.'}</p>}
      <CatalogDownloadProgress status={status} />
      {status.totalPacks !== undefined && <p>{status.completedPacks ?? 0} of {status.totalPacks} product packs ready · {Math.round((status.downloadedBytes ?? 0) / 1024 / 1024)} of {Math.round((status.totalBytes ?? 0) / 1024 / 1024)} MB</p>}
      <p>USDA FoodData Central · CC0. <a href="https://world.openfoodfacts.org">Open Food Facts</a> · ODbL. Source records remain separate; matching product barcodes prefer USDA.</p>
      {status.error && <p role="alert" className="food-error">{status.error}</p>}
      <Button variant="outline" disabled={status.phase === 'checking' || status.phase === 'downloading'} onClick={() => void runtime.updater.check(true)}><RefreshCw />Check for updates</Button>
    </section>
    <section className="settings-card"><h3>Your data</h3><p>A Gramello backup includes your diary, recipes, custom foods, water history, and goals. CSV exports are for spreadsheets.</p>
      <div className="settings-actions"><Button disabled={busy} onClick={() => void run(() => runtime.exportFile('backup'))}><Download />Export backup</Button>
        <Button variant="outline" disabled={busy} onClick={() => void run(() => runtime.exportFile('diary'))}>Export diary CSV</Button><Button variant="outline" disabled={busy} onClick={() => void run(() => runtime.exportFile('water'))}>Export water CSV</Button>
        <Button variant="outline" disabled={busy} onClick={() => input.current?.click()}><Upload />Import backup</Button>
        {recovery && <Button variant="outline" disabled={busy} onClick={() => setRestoring(true)}>Recover previous diary</Button>}
      </div>
      <input ref={input} type="file" accept=".gramello,application/json" aria-label="Choose Gramello backup" className="sr-only" disabled={busy} onChange={event => {
        const file = event.target.files?.[0]; event.target.value = '';
        if (file) void run(async () => { if (file.size > MAX_ARCHIVE_BYTES) throw new Error('Backup exceeds the 32 MB import limit.'); const text = await file.text(); setPending({ text, archive: parseArchive(text) }); });
      }} />
      <p>Backup files can be read by anyone who has access to them.</p>
      <details><summary>Recover a previous web diary</summary><p>Your earlier server diary is still available through this browser’s original cookie. Download it here, then import the backup to replace this local diary. Export your current diary first if you want to keep both copies.</p>
        <Button variant="outline" disabled={busy} onClick={() => void run(async () => { const text = await readHostedBackup(); if (!parseArchive(text).records.length) throw new Error('No previous hosted diary was found for this browser.'); downloadFile(text, `gramello-previous-web-${localDate()}.gramello`); setMessage('Previous web diary downloaded.'); })}>Download previous web diary</Button>
      </details>
      {error && !pending && !restoring && <p role="alert" className="food-error">{error}</p>}{message && <p role="status">{message}</p>}
    </section>
    <Dialog open={!!pending || restoring} onOpenChange={open => { if (!open) close(); }}><DialogContent className="backup-dialog"><DialogHeader><DialogTitle>{restoring ? 'Recover previous diary?' : 'Replace this diary?'}</DialogTitle><DialogDescription>This replaces the personal data saved in this browser.</DialogDescription></DialogHeader>
      {pending && <p>Backup from {new Date(pending.archive.exportedAt).toLocaleString()} · {pending.archive.records.length.toLocaleString()} records.</p>}
      <p>Your current diary is kept as a recovery copy. Recipes, custom foods, water history, and goals are replaced. Food catalogs stay installed.</p>
      {error && <p role="alert" className="food-error">{error}</p>}
      <Button disabled={busy} onClick={() => void run(async () => { if (restoring) await runtime.restorePrevious(); else if (pending) await runtime.importFile(pending.text); setPending(null); setRestoring(false); onReplaced(); })}>{busy ? 'Saving…' : restoring ? 'Recover diary' : 'Replace and import'}</Button>
      <Button variant="outline" disabled={busy} onClick={close}>Cancel</Button>
    </DialogContent></Dialog>
  </section>;
}

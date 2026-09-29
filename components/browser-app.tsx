'use client';

import { useEffect, useState } from 'react';
import GramelloApp from '@/app/gramello-app';
import { getBrowserRuntime, type BrowserRuntime } from '@/lib/browser-local/client';
import { localDiaryFetch, migratePreviousDiary } from '@/lib/browser-startup';
import { prepareOffline } from '@/lib/offline-setup';
import { Button } from './ui/button';
import { BrandWordmark } from './brand-mark';

export function BrowserApp() {
  const [runtime, setRuntime] = useState<BrowserRuntime | null>(null);
  const [client, setClient] = useState<typeof fetch | null>(null);
  const [error, setError] = useState('');
  const [migrationError, setMigrationError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [revision, setRevision] = useState(0);
  const [offlineStatus, setOfflineStatus] = useState(() => typeof navigator !== 'undefined' && !('serviceWorker' in navigator)
    ? 'Offline reload is unavailable in this browser. Your diary is still saved locally.' : 'Preparing offline access…');
  const [retrying, setRetrying] = useState(false);
  const [offlineAttempt, setOfflineAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const local = await getBrowserRuntime();
        try { await migratePreviousDiary(local); }
        catch (cause) { if (active) setMigrationError(cause instanceof Error ? cause.message : 'Your previous web diary could not be checked.'); }
        if (!active) return;
        setRuntime(local); setClient(() => localDiaryFetch(local.api)); setError('');
        void navigator.storage?.persist?.().catch(() => {});
      } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : 'Your local diary could not be opened.'); }
    })();
    return () => { active = false; };
  }, [attempt]);

  useEffect(() => {
    if (!runtime) return;
    const unsubscribe = runtime.subscribe(() => window.dispatchEvent(new Event('gramello-data-change')));
    const check = () => { if (document.visibilityState === 'visible') void runtime.updater.check(); };
    check();
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);
    const timer = setInterval(check, 60_000);
    return () => { clearInterval(timer); unsubscribe(); window.removeEventListener('focus', check); document.removeEventListener('visibilitychange', check); };
  }, [runtime]);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    let active = true;
    void prepareOffline()
      .then(() => { if (active) setOfflineStatus('Ready to use offline'); })
      .catch(cause => { if (active) setOfflineStatus(cause instanceof Error ? cause.message : 'Offline setup could not finish. Try again while connected.'); });
    return () => { active = false; };
  }, [offlineAttempt]);

  async function retryMigration() {
    if (!runtime || retrying) return;
    setRetrying(true);
    try {
      if (!await runtime.needsHostedMigration()) {
        setMigrationError('This browser already has local data. Download your previous web diary in Settings, then import it when you are ready to replace this diary.');
        return;
      }
      await migratePreviousDiary(runtime); setMigrationError(''); setRevision(value => value + 1);
    } catch (cause) { setMigrationError(cause instanceof Error ? cause.message : 'Your previous web diary could not be retrieved.'); }
    finally { setRetrying(false); }
  }

  if (!runtime || !client) return <main className="local-startup"><h1><BrandWordmark/></h1>
    {error ? <><p role="alert">{error}</p><Button onClick={() => { setError(''); setAttempt(value => value + 1); }}>Try again</Button></> : <p role="status">Opening your local diary…</p>}
  </main>;
  return <GramelloApp key={revision} diaryClient={client} runtime={runtime} offlineStatus={offlineStatus} onOfflineRetry={() => { setOfflineStatus('Preparing offline access…'); setOfflineAttempt(value => value + 1); }}
    onReplaced={() => setRevision(value => value + 1)} notice={migrationError && <div className="local-notice" role="alert">
      <p>{migrationError} Your hosted data has not been deleted.</p><Button variant="outline" disabled={retrying} onClick={() => void retryMigration()}>{retrying ? 'Checking…' : 'Retry previous diary'}</Button>
      <Button variant="ghost" onClick={() => setMigrationError('')}>Dismiss</Button>
    </div>} />;
}

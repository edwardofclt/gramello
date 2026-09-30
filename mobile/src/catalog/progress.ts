import type { UpdateStatus } from './updater';

// Transfer progress is separate from the count of verified, installed packs.
export function catalogDownloadProgress(status: UpdateStatus) {
  const active = status.phase === 'checking' || status.phase === 'downloading';
  const percent = status.phase === 'downloading' && status.totalBytes && status.totalBytes > 0
    ? Math.floor(Math.min(100, Math.max(0, (status.downloadedBytes ?? 0) / status.totalBytes * 100)))
    : undefined;
  const label = status.phase === 'checking' ? 'Checking for food updates…'
    : percent === 100 ? 'Finishing food catalog update…' : 'Downloading food information…';
  return { active, percent, label };
}

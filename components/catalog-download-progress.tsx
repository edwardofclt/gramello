'use client';

import { useSyncExternalStore } from 'react';
import { Loader2 } from 'lucide-react';
import type { CatalogUpdater, UpdateStatus } from '@/mobile/src/catalog/updater';
import { catalogDownloadProgress } from '@/mobile/src/catalog/progress';

export function CatalogDownloadProgress({ status }: { status: UpdateStatus }) {
  const { active, percent, label } = catalogDownloadProgress(status);
  if (!active) return null;
  return <div className="catalog-download-progress">
    <div className="catalog-download-label">
      <span>{percent === undefined && <Loader2 size={14} className="spin" aria-hidden="true" />}{label}</span>
      {percent !== undefined && <span>{percent}%</span>}
    </div>
    <div role="progressbar" aria-label="Food catalog download progress" aria-valuemin={0} aria-valuemax={100}
      aria-valuenow={percent} aria-valuetext={percent === undefined ? label : `${percent}%`} className="catalog-download-track">
      <span className={percent === undefined ? 'catalog-download-indeterminate' : undefined} style={{ width: percent === undefined ? '35%' : `${percent}%` }} />
    </div>
  </div>;
}

export function CatalogDownloadIndicator({ updater }: { updater: CatalogUpdater }) {
  const status = useSyncExternalStore(updater.subscribe, updater.getStatus, updater.getStatus);
  const { active, percent, label } = catalogDownloadProgress(status);
  if (!active) return null;
  const circumference = 2 * Math.PI * 17;
  return <div role="progressbar" aria-label="Food catalog download progress" aria-valuemin={0} aria-valuemax={100}
    aria-valuenow={percent} aria-valuetext={percent === undefined ? label : `${percent}%. ${label}`}
    className="catalog-download-ring" title={percent === undefined ? label : `${label} ${percent}%`}>
    {percent === undefined ? <Loader2 size={24} className="spin" aria-hidden="true" /> : <>
      <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true">
        <circle cx="20" cy="20" r="17" stroke="#152f41" strokeWidth="3" fill="none" />
        <circle cx="20" cy="20" r="17" stroke="#6ee7c7" strokeWidth="3" fill="none" strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`} strokeDashoffset={circumference * (1 - percent / 100)} transform="rotate(-90 20 20)" />
      </svg>
      <span aria-hidden="true">{percent}%</span>
    </>}
  </div>;
}

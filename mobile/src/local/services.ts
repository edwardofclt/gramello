import type { Archive } from './records';
import type { LocalRepository } from './repository';
import type { CatalogUpdater } from '../catalog/updater';
export type LocalServices = {
  repository: LocalRepository;
  updater: CatalogUpdater;
  exportFile: (format: 'backup' | 'diary' | 'water') => Promise<void>;
  pickImport: () => Promise<{ text: string; archive: Archive } | null>;
  importFile: (text: string) => Promise<void>;
  restorePrevious: () => Promise<void>;
};

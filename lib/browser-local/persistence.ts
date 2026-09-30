// A request succeeding is not a durability guarantee: IndexedDB may still
// abort its transaction. Only transaction completion acknowledges a write.
export interface SnapshotStore {
  read<T>(key: string): Promise<T | undefined>;
  readMany?<T>(keys: readonly string[]): Promise<Array<T | undefined>>;
  commit(values: ReadonlyArray<readonly [string, unknown]>): Promise<void>;
}

export function openSnapshotStore(factory: IDBFactory = indexedDB): Promise<SnapshotStore> {
  return new Promise((resolve, reject) => {
    const request = factory.open('gramello-local', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('snapshots');
    request.onerror = () => reject(new Error('Browser storage could not be opened. Enable site storage and try again.'));
    request.onblocked = () => reject(new Error('Close other Gramello tabs to finish opening browser storage.'));
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => database.close();
      resolve({
        read<T>(key: string) {
          return new Promise<T | undefined>((done, fail) => {
            const transaction = database.transaction('snapshots', 'readonly');
            const read = transaction.objectStore('snapshots').get(key);
            transaction.oncomplete = () => done(read.result as T | undefined);
            transaction.onabort = () => fail(transaction.error ?? new Error('Browser storage could not be read.'));
            transaction.onerror = () => { /* onabort reports the final failure. */ };
          });
        },
        readMany<T>(keys: readonly string[]) {
          if (!keys.length) return Promise.resolve([]);
          return new Promise<Array<T | undefined>>((done, fail) => {
            const transaction = database.transaction('snapshots', 'readonly');
            const snapshots = transaction.objectStore('snapshots');
            const reads = keys.map(key => snapshots.get(key));
            transaction.oncomplete = () => done(reads.map(read => read.result as T | undefined));
            transaction.onabort = () => fail(transaction.error ?? new Error('Browser storage could not be read.'));
            transaction.onerror = () => { /* onabort reports the final failure. */ };
          });
        },
        commit(values) {
          return new Promise<void>((done, fail) => {
            const transaction = database.transaction('snapshots', 'readwrite', { durability: 'strict' });
            transaction.oncomplete = () => done();
            transaction.onabort = () => fail(new Error('Your change could not be saved in browser storage. Free some space and try again.'));
            transaction.onerror = () => { /* onabort reports the final failure. */ };
            for (const [key, value] of values) transaction.objectStore('snapshots').put(value, key);
          });
        },
      });
    };
  });
}

export interface SnapshotDatabase {
  export(): Uint8Array;
  close(): void;
}

// Each operation starts from the latest durable bytes while owning a lock
// shared by every tab. Failed operations are discarded, including failed
// storage commits, so unpersisted changes can never appear on later reads.
export async function withSnapshot<T, D extends SnapshotDatabase>(options: {
  key: string;
  store: SnapshotStore;
  lock: <R>(name: string, work: () => Promise<R>) => Promise<R>;
  open: (bytes?: Uint8Array) => D;
  write: boolean;
  work: (db: D, extra: Array<readonly [string, unknown]>) => Promise<T>;
}): Promise<T> {
  return options.lock(`gramello:${options.key}`, async () => {
    const bytes = await options.store.read<Uint8Array>(options.key);
    const database = options.open(bytes);
    const extra: Array<readonly [string, unknown]> = [];
    try {
      const result = await options.work(database, extra);
      if (options.write || !bytes || extra.length) {
        await options.store.commit([[options.key, database.export()], ...extra]);
      }
      return result;
    } finally {
      database.close();
    }
  });
}

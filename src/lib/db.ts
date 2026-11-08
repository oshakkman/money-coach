// Local storage in IndexedDB. Every change is written immediately.
// A second database ("rafiq-safety") holds automatic snapshots taken before
// restores, migrations and resets. It is never migrated or cleared by the app.
import { openDB, type IDBPDatabase } from 'idb';
import { DEFAULT_SETTINGS, STORE_NAMES, type DataSet, type Settings, type StoreName } from './types';
import { validateDataSet } from './validateData';

export const DB_NAME = 'rafiq';
export const DB_VERSION = 1; // bump when the structure changes; add a step in upgrade()
const SAFETY_DB = 'rafiq-safety';
const MAX_SNAPSHOTS = 8;

let dbPromise: Promise<IDBPDatabase> | null = null;

async function existingVersion(): Promise<number> {
  if ('databases' in indexedDB) {
    const list = await indexedDB.databases();
    return list.find((d) => d.name === DB_NAME)?.version ?? 0;
  }
  return 0;
}

async function readAllRaw(db: IDBPDatabase): Promise<Partial<DataSet>> {
  const out: Record<string, unknown> = {};
  for (const name of db.objectStoreNames) {
    if (name === 'settings') out.settings = await db.get('settings', 'settings');
    else out[name] = await db.getAll(name);
  }
  return out as Partial<DataSet>;
}

export function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const prev = await existingVersion();
      if (prev > 0 && prev < DB_VERSION) {
        // Safety first: snapshot the old data before upgrading its structure.
        const old = await openDB(DB_NAME, prev);
        await saveSnapshot((await readAllRaw(old)) as DataSet, `Before upgrade v${prev} → v${DB_VERSION}`);
        old.close();
      }
      return openDB(DB_NAME, DB_VERSION, {
        upgrade(db, oldVersion) {
          if (oldVersion < 1) {
            db.createObjectStore('settings', { keyPath: 'id' });
            for (const s of STORE_NAMES) {
              if (s === 'budgets') db.createObjectStore('budgets', { keyPath: 'category' });
              else db.createObjectStore(s, { keyPath: 'id' });
            }
          }
          // Future: if (oldVersion < 2) { ... }
        },
        blocking() {
          // Another tab opened a newer version: close so it can upgrade.
          dbPromise?.then((d) => d.close());
          dbPromise = null;
        },
      });
    })();
  }
  return dbPromise;
}

export async function loadAll(): Promise<DataSet> {
  const db = await getDB();
  const raw = await readAllRaw(db);
  const data: DataSet = {
    settings: { ...DEFAULT_SETTINGS, ...(raw.settings as Settings | undefined) },
    accounts: raw.accounts ?? [],
    transactions: raw.transactions ?? [],
    recurring: raw.recurring ?? [],
    debts: raw.debts ?? [],
    goals: raw.goals ?? [],
    budgets: raw.budgets ?? [],
    actions: raw.actions ?? [],
    conversations: raw.conversations ?? [],
  };
  const problems = validateDataSet(data);
  if (problems.length) throw new DataCorruptionError(problems);
  return data;
}

export class DataCorruptionError extends Error {
  constructor(public problems: string[]) {
    super(`Stored data failed validation: ${problems.slice(0, 3).join('; ')}`);
  }
}

export async function putRecord(store: StoreName, value: unknown) {
  const db = await getDB();
  await db.put(store, value);
}

export async function deleteRecord(store: StoreName, key: string) {
  const db = await getDB();
  await db.delete(store, key);
}

export async function putSettings(settings: Settings) {
  const db = await getDB();
  await db.put('settings', settings);
}

/** Replace everything in one transaction (used by restore and reset). */
export async function replaceAll(data: DataSet) {
  const db = await getDB();
  const names = ['settings', ...STORE_NAMES] as const;
  const tx = db.transaction(names as unknown as string[], 'readwrite');
  for (const n of names) await tx.objectStore(n).clear();
  await tx.objectStore('settings').put(data.settings);
  for (const n of STORE_NAMES) for (const item of data[n]) await tx.objectStore(n).put(item);
  await tx.done;
}

export async function requestPersistentStorage(): Promise<boolean | undefined> {
  if (!navigator.storage?.persist) return undefined;
  if (await navigator.storage.persisted()) return true;
  return navigator.storage.persist();
}

// ------------------------------------------------------------ safety snapshots

export interface Snapshot {
  id: string;
  createdAt: string;
  reason: string;
  schemaVersion: number;
  counts: Record<string, number>;
  data: DataSet;
}

function safetyDB() {
  return openDB(SAFETY_DB, 1, {
    upgrade(db) {
      db.createObjectStore('snapshots', { keyPath: 'id' });
    },
  });
}

export function countRecords(data: Partial<DataSet>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const n of STORE_NAMES) counts[n] = (data[n] as unknown[] | undefined)?.length ?? 0;
  return counts;
}

export async function saveSnapshot(data: DataSet, reason: string) {
  const db = await safetyDB();
  const snap: Snapshot = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    createdAt: new Date().toISOString(),
    reason,
    schemaVersion: DB_VERSION,
    counts: countRecords(data),
    data,
  };
  await db.put('snapshots', snap);
  const all = (await db.getAll('snapshots')) as Snapshot[];
  all.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  for (const old of all.slice(MAX_SNAPSHOTS)) await db.delete('snapshots', old.id);
  db.close();
}

export async function listSnapshots(): Promise<Snapshot[]> {
  const db = await safetyDB();
  const all = (await db.getAll('snapshots')) as Snapshot[];
  db.close();
  return all.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

/** Read whatever can be read, even if validation fails (used by the recovery screen). */
export async function readRawForRecovery(): Promise<Partial<DataSet>> {
  const db = await getDB();
  return readAllRaw(db);
}

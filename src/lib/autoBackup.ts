// Optional automatic backups into a folder you choose (Chrome / Edge desktop).
// The passphrase is held in memory only for the current session and is never
// stored. After reopening the app you click "Resume" and re-enter it.
import { openDB } from 'idb';
import { createBackup, ensureFolderPermission, writeBackupToFolder } from './backup';
import type { DataSet } from './types';

type Dir = FileSystemDirectoryHandle;
const db = () => openDB('rafiq-handles', 1, { upgrade: (d) => d.createObjectStore('h') });

let sessionPassphrase: string | null = null;
let timer: number | undefined;
let lastWritten = '';
const listeners = new Set<() => void>();
export let lastAutoBackupAt: string | null = null;
export let autoBackupError: string | null = null;

export const isAutoBackupActive = () => !!sessionPassphrase;
export const onAutoBackupChange = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
const notify = () => listeners.forEach((f) => f());

export async function getSavedFolder(): Promise<Dir | undefined> {
  return (await db()).get('h', 'folder');
}
export async function saveFolder(dir: Dir) {
  await (await db()).put('h', dir, 'folder');
}
export async function forgetFolder() {
  await (await db()).delete('h', 'folder');
  sessionPassphrase = null;
  notify();
}

/** Must be called from a click (browsers require a user gesture for permission). */
export async function activateAutoBackup(passphrase: string): Promise<boolean> {
  const dir = await getSavedFolder();
  if (!dir || !(await ensureFolderPermission(dir))) return false;
  sessionPassphrase = passphrase;
  notify();
  return true;
}

/** Debounced: writes an encrypted backup 30 seconds after the last change. */
export function scheduleAutoBackup(data: DataSet, onDone: (at: string) => void) {
  if (!sessionPassphrase) return;
  window.clearTimeout(timer);
  timer = window.setTimeout(async () => {
    const fingerprint = JSON.stringify(data);
    if (fingerprint === lastWritten || !sessionPassphrase) return;
    try {
      const dir = await getSavedFolder();
      if (!dir) return;
      const file = await createBackup(data, sessionPassphrase);
      await writeBackupToFolder(dir, file);
      lastWritten = fingerprint;
      lastAutoBackupAt = file.createdAt;
      autoBackupError = null;
      onDone(file.createdAt);
    } catch (e) {
      autoBackupError = (e as Error).message;
    }
    notify();
  }, 30_000);
}

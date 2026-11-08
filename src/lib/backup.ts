// Encrypted backups: PBKDF2-SHA256 (600,000 iterations) derives a key from your
// passphrase; AES-256-GCM encrypts and authenticates the data. A wrong
// passphrase or a modified file fails to decrypt — it can never silently load
// corrupted data. Without the passphrase the file cannot be opened by anyone,
// including you, so store the passphrase somewhere safe.
import type { DataSet } from './types';
import { validateDataSet } from './validateData';
import { countRecords, DB_VERSION } from './db';

export const BACKUP_FORMAT = 'rafiq-backup';
export const BACKUP_FORMAT_VERSION = 1;
export const APP_VERSION = '1.0.0';
const ITERATIONS = 600_000;

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  formatVersion: number;
  appVersion: string;
  schemaVersion: number;
  createdAt: string;
  counts: Record<string, number>;
  kdf: { name: 'PBKDF2'; hash: 'SHA-256'; iterations: number; salt: string };
  cipher: { name: 'AES-GCM'; iv: string };
  data: string;
}

export interface BackupPreview {
  createdAt: string;
  appVersion: string;
  schemaVersion: number;
  counts: Record<string, number>;
  data: DataSet;
}

const enc = new TextEncoder();
const dec = new TextDecoder();

function toB64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromB64(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function deriveKey(passphrase: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
  const base = await crypto.subtle.importKey('raw', enc.encode(passphrase.normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export function passphraseProblem(p: string): string | null {
  if (p.length < 10) return 'Use at least 10 characters.';
  if (/^(.)\1+$/.test(p)) return 'Do not repeat one character.';
  return null;
}

export async function createBackup(data: DataSet, passphrase: string): Promise<BackupFile> {
  const problem = passphraseProblem(passphrase);
  if (problem) throw new Error(problem);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt, ITERATIONS);
  const createdAt = new Date().toISOString();
  const payload = JSON.stringify({ schemaVersion: DB_VERSION, exportedAt: createdAt, data });
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(payload)));
  return {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    appVersion: APP_VERSION,
    schemaVersion: DB_VERSION,
    createdAt,
    counts: countRecords(data),
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: ITERATIONS, salt: toB64(salt) },
    cipher: { name: 'AES-GCM', iv: toB64(iv) },
    data: toB64(cipher),
  };
}

export function backupFileName(createdAt: string): string {
  return `rafiq-backup-${createdAt.slice(0, 16).replace(/[:T]/g, '-')}.rafiq`;
}

/** Step 1 of import: check the file looks like a Rafiq backup (before asking for a passphrase). */
export function parseBackupFile(text: string): BackupFile {
  let obj: BackupFile;
  try {
    obj = JSON.parse(text);
  } catch {
    throw new Error('This file is not a Rafiq backup (it is not valid JSON).');
  }
  if (obj?.format !== BACKUP_FORMAT) throw new Error('This file is not a Rafiq backup.');
  if (obj.formatVersion > BACKUP_FORMAT_VERSION) throw new Error('This backup was made by a newer version of Rafiq. Update the app first.');
  if (!obj.kdf?.salt || !obj.cipher?.iv || typeof obj.data !== 'string') throw new Error('The backup file is incomplete or damaged.');
  return obj;
}

/** Step 2 of import: decrypt and validate. Nothing is written until you confirm. */
export async function openBackup(file: BackupFile, passphrase: string): Promise<BackupPreview> {
  const key = await deriveKey(passphrase, fromB64(file.kdf.salt), file.kdf.iterations);
  let plain: string;
  try {
    plain = dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(file.cipher.iv) }, key, fromB64(file.data)));
  } catch {
    throw new Error('Wrong passphrase, or the file has been modified or damaged.');
  }
  const payload = JSON.parse(plain) as { schemaVersion: number; data: DataSet };
  if (payload.schemaVersion > DB_VERSION) throw new Error('This backup needs a newer version of Rafiq.');
  const problems = validateDataSet(payload.data);
  if (problems.length) throw new Error(`The backup decrypted but its contents are invalid: ${problems.slice(0, 3).join('; ')}`);
  return { createdAt: file.createdAt, appVersion: file.appVersion, schemaVersion: payload.schemaVersion, counts: countRecords(payload.data), data: payload.data };
}

export function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ------------------------------------------------------------ optional folder auto-backup
// Supported in Chrome / Edge on desktop (File System Access API). Not on iPhone/iPad/Safari/Firefox.

type DirHandle = FileSystemDirectoryHandle & {
  queryPermission?: (o: { mode: 'readwrite' }) => Promise<PermissionState>;
  requestPermission?: (o: { mode: 'readwrite' }) => Promise<PermissionState>;
};

export const folderBackupSupported = () => typeof window !== 'undefined' && 'showDirectoryPicker' in window;

export async function pickBackupFolder(): Promise<DirHandle> {
  return (window as unknown as { showDirectoryPicker: (o: object) => Promise<DirHandle> }).showDirectoryPicker({ id: 'rafiq-backups', mode: 'readwrite' });
}

export async function ensureFolderPermission(dir: DirHandle): Promise<boolean> {
  if ((await dir.queryPermission?.({ mode: 'readwrite' })) === 'granted') return true;
  return (await dir.requestPermission?.({ mode: 'readwrite' })) === 'granted';
}

export async function writeBackupToFolder(dir: DirHandle, backup: BackupFile) {
  const text = JSON.stringify(backup);
  for (const name of ['rafiq-backup-latest.rafiq', `rafiq-backup-${backup.createdAt.slice(0, 10)}.rafiq`]) {
    const fh = await dir.getFileHandle(name, { create: true });
    const w = await fh.createWritable();
    await w.write(text);
    await w.close();
  }
}

import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createBackup, openBackup, parseBackupFile } from '../src/lib/backup';
import { validateDataSet } from '../src/lib/validateData';
import { scenario } from './fixtures';

describe('encrypted backup', () => {
  it('round-trips data with the correct passphrase', async () => {
    const data = scenario();
    const file = await createBackup(data, 'correct horse battery');
    const text = JSON.stringify(file);
    expect(text).not.toContain('Credit card'); // encrypted, not readable
    expect(text).not.toContain('Salary');
    const preview = await openBackup(parseBackupFile(text), 'correct horse battery');
    expect(preview.data).toEqual(data);
    expect(preview.counts.transactions).toBe(5);
  });
  it('rejects a wrong passphrase', async () => {
    const file = await createBackup(scenario(), 'correct horse battery');
    await expect(openBackup(file, 'wrong passphrase!!')).rejects.toThrow(/Wrong passphrase/);
  });
  it('rejects tampered files', async () => {
    const file = await createBackup(scenario(), 'correct horse battery');
    const bytes = file.data.split('');
    bytes[10] = bytes[10] === 'A' ? 'B' : 'A';
    await expect(openBackup({ ...file, data: bytes.join('') }, 'correct horse battery')).rejects.toThrow();
  });
  it('rejects non-backup files and weak passphrases', async () => {
    expect(() => parseBackupFile('{"hello":1}')).toThrow(/not a Rafiq backup/);
    expect(() => parseBackupFile('not json')).toThrow();
    await expect(createBackup(scenario(), 'short')).rejects.toThrow();
  });
  it('validation catches corrupted records', () => {
    const d = scenario() as unknown as Record<string, unknown>;
    (d.transactions as unknown[]).push({ id: 'bad', amount: 'ten' });
    expect(validateDataSet(d).length).toBeGreaterThan(0);
    expect(validateDataSet(scenario())).toEqual([]);
  });
});

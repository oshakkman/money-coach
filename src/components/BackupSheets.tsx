import { useRef, useState } from 'react';
import { CheckCircle2, Download, FileUp, Lock, ShieldCheck } from 'lucide-react';
import { Field, Sheet } from './ui';
import { useStore } from '../store';
import { backupFileName, createBackup, downloadText, openBackup, parseBackupFile, passphraseProblem, type BackupFile, type BackupPreview } from '../lib/backup';

const COUNT_LABELS: Record<string, string> = {
  accounts: 'accounts',
  transactions: 'transactions',
  recurring: 'bills & income',
  debts: 'debts',
  goals: 'goals',
  budgets: 'budgets',
  actions: 'actions',
  conversations: 'conversations',
};

export function BackupSheet() {
  const { getData, updateSettings, closeSheet, toast } = useStore();
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const problem = passphraseProblem(p1);

  const run = async () => {
    setError(null);
    if (problem) return setError(problem);
    if (p1 !== p2) return setError('The two passphrases do not match.');
    setBusy(true);
    try {
      const data = getData();
      const file = await createBackup(data, p1);
      // Verify the file can be opened again before declaring success.
      await openBackup(parseBackupFile(JSON.stringify(file)), p1);
      const name = backupFileName(file.createdAt);
      downloadText(name, JSON.stringify(file));
      await updateSettings({ lastBackupAt: file.createdAt, backupReminderSnoozedUntil: undefined });
      setDone(name);
      toast('Backup downloaded');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <Sheet title="Backup created" onClose={closeSheet} footer={<button className="btn primary" onClick={closeSheet}>Done</button>}>
        <div className="stack">
          <div className="row"><CheckCircle2 color="var(--good)" /> <strong>{done}</strong></div>
          <p className="muted small">The file was checked and opens correctly with your passphrase. Now move it somewhere safe that is not this device: iCloud Drive, Google Drive, OneDrive, email to yourself, or a USB stick.</p>
          <p className="muted small">On iPhone/iPad: in the download prompt choose <b>Save to Files</b> → <b>iCloud Drive</b>.</p>
          <p className="small" style={{ color: 'var(--warn)' }}>Without the passphrase this file cannot be opened — by anyone, including you.</p>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet title="Create encrypted backup" onClose={closeSheet} footer={<button className="btn primary" disabled={busy} onClick={run}><Download size={18} />{busy ? 'Encrypting…' : 'Encrypt & download'}</button>}>
      <div className="stack">
        <div className="banner info"><Lock size={18} /><span className="grow small">Your data is encrypted on this device with AES-256 before it is saved. Choose a passphrase you will remember — it cannot be recovered.</span></div>
        <Field label="Passphrase" hint="At least 10 characters. A short sentence works well." error={p1 && problem ? problem : null}>
          {(id) => <input id={id} type="password" className="input" autoComplete="new-password" value={p1} onChange={(e) => setP1(e.target.value)} />}
        </Field>
        <Field label="Repeat passphrase" error={p2 && p1 !== p2 ? 'Does not match' : null}>
          {(id) => <input id={id} type="password" className="input" autoComplete="new-password" value={p2} onChange={(e) => setP2(e.target.value)} />}
        </Field>
        {error && <div className="banner bad"><span className="grow small">{error}</span></div>}
      </div>
    </Sheet>
  );
}

export function RestoreSheet() {
  const { replaceAll, closeSheet, toast } = useStore();
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<BackupFile | null>(null);
  const [fileName, setFileName] = useState('');
  const [pass, setPass] = useState('');
  const [preview, setPreview] = useState<BackupPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const pick = async (f: File | undefined) => {
    setError(null);
    setPreview(null);
    if (!f) return;
    if (f.size > 50_000_000) return setError('File is too large to be a Rafiq backup.');
    try {
      setFile(parseBackupFile(await f.text()));
      setFileName(f.name);
    } catch (e) {
      setFile(null);
      setError((e as Error).message);
    }
  };

  const unlock = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      setPreview(await openBackup(file, pass));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const restore = async () => {
    if (!preview) return;
    setBusy(true);
    try {
      await replaceAll(preview.data, `Before restoring backup from ${preview.createdAt.slice(0, 10)}`);
      toast('Backup restored');
      closeSheet();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Sheet
      title="Restore from backup"
      onClose={closeSheet}
      footer={
        preview ? (
          <button className="btn primary" disabled={busy} onClick={restore}><ShieldCheck size={18} />Replace my data with this backup</button>
        ) : file ? (
          <button className="btn primary" disabled={busy || !pass} onClick={unlock}>{busy ? 'Checking…' : 'Unlock & check'}</button>
        ) : (
          <button className="btn primary" onClick={() => fileInput.current?.click()}><FileUp size={18} />Choose backup file</button>
        )
      }
    >
      <div className="stack">
        <input ref={fileInput} type="file" accept=".rafiq,application/json,.json" style={{ display: 'none' }} onChange={(e) => pick(e.target.files?.[0])} />
        {file && (
          <div className="card flat tight">
            <div className="row between"><strong className="small">{fileName}</strong><button className="btn sm ghost" onClick={() => fileInput.current?.click()}>Change</button></div>
            <div className="faint xs">Created {new Date(file.createdAt).toLocaleString()} · app v{file.appVersion}</div>
          </div>
        )}
        {file && !preview && (
          <Field label="Backup passphrase">{(id) => <input id={id} type="password" className="input" autoFocus value={pass} onChange={(e) => setPass(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && unlock()} />}</Field>
        )}
        {preview && (
          <div className="stack-sm">
            <div className="row"><CheckCircle2 color="var(--good)" size={20} /><strong>Backup is valid</strong></div>
            <p className="muted small">It contains: {Object.entries(preview.counts).filter(([, v]) => v > 0).map(([k, v]) => `${v} ${COUNT_LABELS[k] ?? k}`).join(', ') || 'no records'}.</p>
            <p className="small" style={{ color: 'var(--warn)' }}>Restoring replaces everything currently in Rafiq on this device. A safety copy of your current data is saved first (Settings → Recovery snapshots).</p>
          </div>
        )}
        {!file && <p className="muted small">Select a <b>.rafiq</b> backup file. Nothing changes until you unlock it, check its contents, and confirm.</p>}
        {error && <div className="banner bad"><span className="grow small">{error}</span></div>}
      </div>
    </Sheet>
  );
}

// Shown when local data cannot be loaded or fails validation. Nothing is
// deleted automatically: you choose how to recover.
import { useEffect, useState } from 'react';
import { AlertTriangle, Download, History, RotateCcw, Upload } from 'lucide-react';
import { useStore } from '../store';
import { listSnapshots, readRawForRecovery, type Snapshot } from '../lib/db';
import { downloadText } from '../lib/backup';
import { DEFAULT_SETTINGS } from '../lib/types';

export function Recovery({ error }: { error: Error }) {
  const { replaceAll, openSheet, reload } = useStore();
  const [snaps, setSnaps] = useState<Snapshot[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    listSnapshots().then(setSnaps).catch(() => {});
  }, []);

  const exportRaw = async () => {
    try {
      const raw = await readRawForRecovery();
      downloadText(`rafiq-raw-export-${new Date().toISOString().slice(0, 10)}.rafiq.json`, JSON.stringify(raw, null, 2));
      setMsg('Raw data downloaded (NOT encrypted — delete it after recovery).');
    } catch (e) {
      setMsg(`Could not read raw data: ${(e as Error).message}`);
    }
  };

  return (
    <div className="welcome" style={{ justifyContent: 'flex-start', paddingTop: 48 }}>
      <div className="row"><AlertTriangle color="var(--bad)" /><h1>Data recovery</h1></div>
      <p className="muted">Rafiq could not safely load your records on this device. Nothing has been deleted. Choose how to recover:</p>
      <div className="card flat tight small faint" style={{ wordBreak: 'break-word' }}>{error.message}</div>
      <div className="stack-sm">
        <button className="btn" onClick={() => reload()}><RotateCcw size={18} />Try again</button>
        <button className="btn primary" onClick={() => openSheet({ kind: 'restore' })}><Upload size={18} />Restore from an encrypted backup file</button>
        {snaps.map((s) => (
          <button key={s.id} className="btn" onClick={async () => { if (window.confirm(`Restore snapshot from ${new Date(s.createdAt).toLocaleString()}?`)) await replaceAll(s.data, 'Before recovery restore'); }}>
            <History size={18} />Restore snapshot: {new Date(s.createdAt).toLocaleString()} ({s.counts.transactions ?? 0} tx)
          </button>
        ))}
        <button className="btn" onClick={exportRaw}><Download size={18} />Download raw data for manual repair</button>
        <button
          className="btn danger"
          onClick={async () => {
            if (!window.confirm('Start fresh? Current data is kept as a recovery snapshot first.')) return;
            await replaceAll({ settings: { ...DEFAULT_SETTINGS }, accounts: [], transactions: [], recurring: [], debts: [], goals: [], budgets: [], actions: [], conversations: [] }, 'Before starting fresh (recovery)');
          }}
        >
          Start fresh (keeps a snapshot)
        </button>
      </div>
      {msg && <p className="small">{msg}</p>}
    </div>
  );
}

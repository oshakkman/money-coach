import { useState } from 'react';
import { HardDrive, ListChecks, Lock, WifiOff } from 'lucide-react';
import { Field } from '../components/ui';
import { useStore } from '../store';

const CURRENCIES = ['JOD', 'USD', 'EUR', 'GBP', 'AED', 'SAR', 'QAR', 'KWD', 'BHD', 'OMR', 'EGP'];

export function Welcome() {
  const { updateSettings, openSheet } = useStore();
  const [currency, setCurrency] = useState('JOD');
  const start = async (restore = false) => {
    await updateSettings({ currency, welcomeDone: true });
    if (restore) openSheet({ kind: 'restore' });
    else openSheet({ kind: 'account' });
  };
  return (
    <div className="welcome">
      <div className="logo">ر</div>
      <div className="stack-sm">
        <h1 style={{ fontSize: 32 }}>Rafiq</h1>
        <p className="muted" style={{ fontSize: 17 }}>Your personal money accountability partner. It tells you what you can safely spend, what to do next — and checks that you did it.</p>
      </div>
      <div className="stack">
        <div className="feature"><div className="ic"><HardDrive size={18} /></div><div><b>Private by design.</b> <span className="muted">Your records stay on this device. No account, no sign-up.</span></div></div>
        <div className="feature"><div className="ic"><WifiOff size={18} /></div><div><b>Works offline.</b> <span className="muted">Budgets, debts and Rafiq’s advice work without internet.</span></div></div>
        <div className="feature"><div className="ic"><ListChecks size={18} /></div><div><b>Built on your real numbers.</b> <span className="muted">Nothing is invented — add what you know, step by step.</span></div></div>
        <div className="feature"><div className="ic"><Lock size={18} /></div><div><b>Encrypted backups.</b> <span className="muted">Protected with a passphrase only you know.</span></div></div>
      </div>
      <Field label="Your currency">
        {(id) => (
          <select id={id} className="input" value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        )}
      </Field>
      <div className="stack-sm">
        <button className="btn primary block" onClick={() => start(false)}>Start — add my current balance</button>
        <button className="btn ghost block" onClick={() => start(true)}>I have a backup to restore</button>
      </div>
    </div>
  );
}

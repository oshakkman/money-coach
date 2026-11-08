import { useEffect, useState } from 'react';
import { Cloud, Database, Download, FolderSync, HardDrive, History, Info, Lock, RefreshCw, Trash2, Upload } from 'lucide-react';
import { Card, CardHead, Field, KV, Segmented, Switch, confirmAction, useMoney } from '../components/ui';
import { useStore } from '../store';
import { checkConnection } from '../lib/ai';
import { listSnapshots, requestPersistentStorage, type Snapshot } from '../lib/db';
import { APP_VERSION, folderBackupSupported, pickBackupFolder, passphraseProblem } from '../lib/backup';
import { activateAutoBackup, forgetFolder, getSavedFolder, isAutoBackupActive, lastAutoBackupAt, autoBackupError, onAutoBackupChange, saveFolder } from '../lib/autoBackup';
import { DEFAULT_SETTINGS } from '../lib/types';
import { parseAmount } from '../lib/money';
import { relativeDay } from '../lib/dates';
import { useOnline } from '../useOnline';

const CURRENCIES = ['JOD', 'USD', 'EUR', 'GBP', 'AED', 'SAR', 'QAR', 'KWD', 'BHD', 'OMR', 'EGP', 'LBP', 'TRY'];

export function SettingsPage() {
  const { data, updateSettings, openSheet, replaceAll, toast, today } = useStore();
  const s = data.settings;
  const m = useMoney();
  const online = useOnline();
  const [code, setCode] = useState(s.aiAccessCode ?? '');
  const [conn, setConn] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [persisted, setPersisted] = useState<boolean | undefined>();
  const [usage, setUsage] = useState<string>('');
  const [folderName, setFolderName] = useState<string | null>(null);
  const [, force] = useState(0);
  const [autoPass, setAutoPass] = useState('');

  useEffect(() => {
    listSnapshots().then(setSnapshots).catch(() => {});
    navigator.storage?.persisted?.().then(setPersisted);
    navigator.storage?.estimate?.().then((e) => setUsage(e.usage ? `${(e.usage / 1024 / 1024).toFixed(1)} MB used` : ''));
    getSavedFolder().then((d) => setFolderName(d?.name ?? null)).catch(() => {});
    return onAutoBackupChange(() => force((x) => x + 1));
  }, []);

  const test = async () => {
    setTesting(true);
    const r = await checkConnection(code.trim());
    setTesting(false);
    if (r.error) setConn(r.error);
    else if (!r.configured) setConn('The server is reachable but Claude is not configured there (missing ANTHROPIC_API_KEY or RAFIQ_ACCESS_CODE).');
    else if (!r.codeValid) setConn('Server is configured, but this access code is wrong.');
    else {
      setConn(`Connected ✓ (model: ${r.model})`);
      await updateSettings({ aiAccessCode: code.trim() });
    }
  };

  const eraseAll = async () => {
    if (!confirmAction('Erase ALL Rafiq data on this device? A recovery snapshot is kept, but you should create a backup first.')) return;
    if (!confirmAction('Are you sure? This cannot be undone without a backup or snapshot.')) return;
    await replaceAll({ settings: { ...DEFAULT_SETTINGS, welcomeDone: true, currency: s.currency }, accounts: [], transactions: [], recurring: [], debts: [], goals: [], budgets: [], actions: [], conversations: [] }, 'Before erasing all data');
    toast('All data erased');
    setSnapshots(await listSnapshots());
  };

  const restoreSnapshot = async (snap: Snapshot) => {
    if (!confirmAction(`Restore the snapshot from ${new Date(snap.createdAt).toLocaleString()}? Your current data is snapshotted first.`)) return;
    await replaceAll(snap.data, 'Before restoring a recovery snapshot');
    toast('Snapshot restored');
    setSnapshots(await listSnapshots());
  };

  return (
    <div className="stack">
      <div className="topbar"><div className="title"><h1>Settings</h1></div></div>
      <div className="grid-2">
        <div className="stack">
          <Card>
            <CardHead title="Backup & restore" icon={<Lock size={18} />} />
            <div className="stack">
              <div className="banner info"><Info size={18} /><span className="grow small">Your financial records are stored only in this browser on this device. Browser storage can be cleared by the system or by you — it is <b>not</b> a permanent backup. Keep encrypted backups somewhere else.</span></div>
              <KV k="Last backup" v={s.lastBackupAt ? `${new Date(s.lastBackupAt).toLocaleString()} (${relativeDay(s.lastBackupAt.slice(0, 10), today)})` : 'Never'} />
              <div className="row wrap">
                <button className="btn primary" onClick={() => openSheet({ kind: 'backup' })}><Download size={18} />Back up now</button>
                <button className="btn" onClick={() => openSheet({ kind: 'restore' })}><Upload size={18} />Restore</button>
              </div>
              <p className="faint xs">Rafiq reminds you every 7 days. Backups are encrypted with your passphrase (AES-256-GCM).</p>
            </div>
          </Card>

          <Card>
            <CardHead title="Automatic folder backup" icon={<FolderSync size={18} />} />
            {!folderBackupSupported() ? (
              <p className="muted small">Not supported in this browser. Automatic folder backups work in Chrome or Edge on a computer. Use “Back up now” instead — it works everywhere, including iPhone and iPad.</p>
            ) : (
              <div className="stack-sm">
                <p className="muted small">Optional. Saves an encrypted backup into a folder you choose (e.g. a OneDrive/iCloud/Dropbox folder) 30 seconds after each change. For security the passphrase is not stored, so after reopening Rafiq you press “Resume” once.</p>
                <KV k="Folder" v={folderName ?? 'Not set'} />
                {lastAutoBackupAt && <KV k="Last automatic backup" v={new Date(lastAutoBackupAt).toLocaleTimeString()} />}
                {autoBackupError && <p className="small" style={{ color: 'var(--bad)' }}>{autoBackupError}</p>}
                {isAutoBackupActive() ? (
                  <div className="row"><span className="badge good">Active this session</span><button className="btn sm ghost" onClick={async () => { await forgetFolder(); setFolderName(null); }}>Turn off</button></div>
                ) : (
                  <>
                    <Field label="Backup passphrase (this session only)" error={autoPass && passphraseProblem(autoPass) ? passphraseProblem(autoPass) : null}>
                      {(id) => <input id={id} type="password" className="input" value={autoPass} onChange={(e) => setAutoPass(e.target.value)} />}
                    </Field>
                    <div className="row wrap">
                      <button
                        className="btn"
                        disabled={!!passphraseProblem(autoPass)}
                        onClick={async () => {
                          try {
                            if (!folderName) {
                              const dir = await pickBackupFolder();
                              await saveFolder(dir);
                              setFolderName(dir.name);
                            }
                            const ok = await activateAutoBackup(autoPass);
                            toast(ok ? 'Automatic backup on' : 'Folder permission was not granted');
                            setAutoPass('');
                          } catch {
                            /* user cancelled */
                          }
                        }}
                      >
                        {folderName ? 'Resume' : 'Choose folder & start'}
                      </button>
                      {folderName && <button className="btn ghost" onClick={async () => { await forgetFolder(); setFolderName(null); }}>Forget folder</button>}
                    </div>
                  </>
                )}
              </div>
            )}
          </Card>

          <Card>
            <CardHead title="Recovery snapshots" icon={<History size={18} />} />
            <p className="muted small" style={{ marginBottom: 8 }}>Rafiq automatically keeps up to 8 internal copies taken before restores, erases and app upgrades. They live on this device only.</p>
            {snapshots.length === 0 ? <p className="faint small">None yet.</p> : (
              <div className="list">
                {snapshots.map((sn) => (
                  <div key={sn.id} className="list-row">
                    <div className="main-text">
                      <div className="t">{sn.reason}</div>
                      <div className="s">{new Date(sn.createdAt).toLocaleString()} · {sn.counts.transactions ?? 0} transactions</div>
                    </div>
                    <button className="btn sm" onClick={() => restoreSnapshot(sn)}>Restore</button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="stack">
          <Card>
            <CardHead title="Preferences" />
            <div className="stack">
              <Field label="Currency" hint="Changing the currency only changes labels — amounts are not converted.">
                {(id) => (
                  <select id={id} className="input" value={s.currency} onChange={(e) => updateSettings({ currency: e.target.value })}>
                    {[...new Set([s.currency, ...CURRENCIES])].map((c) => <option key={c}>{c}</option>)}
                  </select>
                )}
              </Field>
              <Field label="Safety buffer" hint={`Kept out of safe-to-spend at all times. Currently ${m(s.buffer)}.`}>
                {(id) => <input id={id} className="input" inputMode="decimal" defaultValue={s.buffer || ''} placeholder="0" onBlur={(e) => updateSettings({ buffer: Math.max(0, parseAmount(e.target.value) || 0) })} />}
              </Field>
              <Field label="Payday (day of month) if you have no regular income" hint="Used only when no income is recorded in Plan.">
                {(id) => <input id={id} className="input" inputMode="numeric" defaultValue={s.fallbackPayday ?? ''} placeholder="e.g. 25" onBlur={(e) => { const n = Number(e.target.value); updateSettings({ fallbackPayday: n >= 1 && n <= 31 ? n : undefined }); }} />}
              </Field>
              <div className="field">
                <label>Appearance</label>
                <Segmented label="Theme" value={s.theme} onChange={(v) => updateSettings({ theme: v })} options={[{ value: 'system', label: 'Auto' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />
              </div>
              {s.onboardingDismissed && <button className="btn sm ghost" style={{ alignSelf: 'flex-start' }} onClick={() => updateSettings({ onboardingDismissed: false })}>Show setup checklist again</button>}
            </div>
          </Card>

          <Card>
            <CardHead title="Claude connection (optional)" icon={<Cloud size={18} />} />
            <div className="stack">
              <p className="muted small">
                Rafiq works fully offline. If you deployed the online version with an Anthropic API key, enter the private access code you chose (RAFIQ_ACCESS_CODE). The API key itself stays on your server and never reaches this device.
              </p>
              <Field label="Access code">{(id) => <input id={id} type="password" className="input" value={code} autoComplete="off" onChange={(e) => setCode(e.target.value)} />}</Field>
              <div className="row wrap">
                <button className="btn" disabled={!code.trim() || testing || !online} onClick={test}><RefreshCw size={16} />{testing ? 'Testing…' : 'Test & save'}</button>
                {s.aiAccessCode && <button className="btn ghost" onClick={async () => { await updateSettings({ aiAccessCode: undefined, useAiByDefault: false }); setCode(''); setConn('Removed.'); }}>Remove</button>}
              </div>
              {!online && <p className="faint xs">You are offline.</p>}
              {conn && <p className="small" style={{ color: conn.includes('✓') ? 'var(--good)' : 'var(--warn)' }}>{conn}</p>}
              {s.aiAccessCode && (
                <>
                  <Switch checked={s.useAiByDefault} onChange={async (v) => { if (v && !s.aiConsent) { if (!confirmAction('Allow Rafiq to send a summary of your finances to Claude when you ask a question in the Rafiq tab?')) return; } await updateSettings({ useAiByDefault: v, aiConsent: v || s.aiConsent }); }} label="Use Claude by default in Rafiq" hint="You can still switch it off per question." />
                  {s.aiConsent && <button className="btn sm ghost" style={{ alignSelf: 'flex-start' }} onClick={() => updateSettings({ aiConsent: false, useAiByDefault: false })}>Withdraw consent to send data to Claude</button>}
                </>
              )}
            </div>
          </Card>

          <Card>
            <CardHead title="Storage" icon={<HardDrive size={18} />} />
            <KV k="Persistent storage" v={persisted === undefined ? 'Unknown' : persisted ? 'Granted' : 'Not granted'} />
            {usage && <KV k="Space" v={usage} />}
            <KV k="Records" v={`${data.transactions.length} transactions · ${data.accounts.length} accounts`} />
            {!persisted && (
              <button className="btn sm" style={{ marginTop: 8 }} onClick={async () => setPersisted(await requestPersistentStorage())}><Database size={14} />Ask browser to keep data</button>
            )}
            <p className="faint xs" style={{ marginTop: 8 }}>On iPhone/iPad, add Rafiq to your Home Screen — Safari may delete website data that is not used for 7 days, but Home Screen apps are exempt.</p>
          </Card>

          <Card>
            <CardHead title="Danger zone" icon={<Trash2 size={18} />} />
            <button className="btn danger" onClick={eraseAll}><Trash2 size={16} />Erase all data on this device</button>
          </Card>

          <p className="faint xs" style={{ textAlign: 'center' }}>Rafiq v{APP_VERSION} · Your data never leaves this device unless you export it or ask Claude.</p>
        </div>
      </div>
    </div>
  );
}

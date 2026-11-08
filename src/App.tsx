import { Component, useEffect, useState, type ReactNode } from 'react';
import { ArrowLeftRight, Home, Landmark, PieChart, Plus, Settings as SettingsIcon, Sparkles, WifiOff } from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useStore } from './store';
import { Sheets } from './components/forms';
import { Dashboard } from './pages/Dashboard';
import { Transactions } from './pages/Transactions';
import { Plan } from './pages/Plan';
import { Debts } from './pages/Debts';
import { Rafiq } from './pages/Rafiq';
import { SettingsPage } from './pages/Settings';
import { Welcome } from './pages/Welcome';
import { Recovery } from './pages/Recovery';
import type { Route } from './lib/nextAction';
import { useOnline } from './useOnline';
import { requestPersistentStorage } from './lib/db';
import { scheduleAutoBackup } from './lib/autoBackup';

const ROUTES: Route[] = ['dashboard', 'transactions', 'plan', 'debts', 'rafiq', 'settings'];
const NAV: { route: Route; label: string; icon: typeof Home }[] = [
  { route: 'dashboard', label: 'Home', icon: Home },
  { route: 'transactions', label: 'Activity', icon: ArrowLeftRight },
  { route: 'rafiq', label: 'Rafiq', icon: Sparkles },
  { route: 'plan', label: 'Plan', icon: PieChart },
  { route: 'debts', label: 'Debts', icon: Landmark },
];

function useHashRoute(): [Route, (r: Route) => void] {
  const read = () => {
    const h = window.location.hash.replace('#/', '') as Route;
    return ROUTES.includes(h) ? h : 'dashboard';
  };
  const [route, setRoute] = useState<Route>(read);
  useEffect(() => {
    const on = () => setRoute(read());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return [
    route,
    (r) => {
      window.location.hash = `#/${r}`;
      window.scrollTo({ top: 0 });
    },
  ];
}

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error)
      return (
        <div className="welcome">
          <h1>Something went wrong</h1>
          <p className="muted">Your data is safe — it is stored separately. Reload to continue. If this keeps happening, use Settings → Backup to export your data.</p>
          <p className="faint small">{this.state.error.message}</p>
          <button className="btn primary" onClick={() => window.location.reload()}>Reload</button>
        </div>
      );
    return this.props.children;
  }
}

function UpdatePrompt() {
  const { needRefresh: [needRefresh, setNeedRefresh], updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      // Check for a new version every hour while open.
      if (reg) setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
    },
  });
  if (!needRefresh) return null;
  return (
    <div className="banner info" style={{ position: 'fixed', top: 12, left: 12, right: 12, zIndex: 70, boxShadow: 'var(--shadow-lg)', maxWidth: 560, margin: '0 auto' }}>
      <span className="grow small">A new version of Rafiq is available. Your data is kept.</span>
      <button className="btn sm primary" onClick={() => updateServiceWorker(true)}>Update</button>
      <button className="btn sm ghost" onClick={() => setNeedRefresh(false)}>Later</button>
    </div>
  );
}

export function App() {
  const { status, data, sheet, openSheet, toastMsg, updateSettings } = useStore();
  const [route, go] = useHashRoute();
  const online = useOnline();

  useEffect(() => {
    const t = data.settings.theme;
    if (t === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
  }, [data.settings.theme]);

  useEffect(() => {
    if (status.kind === 'ready' && data.accounts.length > 0) requestPersistentStorage().catch(() => {});
  }, [status.kind, data.accounts.length]);

  useEffect(() => {
    if (status.kind === 'ready') scheduleAutoBackup(data, (at) => updateSettings({ lastBackupAt: at }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  if (status.kind === 'loading') return <div className="welcome"><div className="logo">ر</div></div>;
  if (status.kind === 'error')
    return (
      <>
        <Recovery error={status.error} />
        <Sheets />
      </>
    );
  if (!data.settings.welcomeDone)
    return (
      <>
        <Welcome />
        <Sheets />
      </>
    );

  const page = {
    dashboard: <Dashboard go={go} />,
    transactions: <Transactions />,
    plan: <Plan />,
    debts: <Debts />,
    rafiq: <Rafiq />,
    settings: <SettingsPage />,
  }[route];

  return (
    <ErrorBoundary>
      <UpdatePrompt />
      <div className="app">
        <nav className="sidebar" aria-label="Main">
          <div className="brand"><span className="brand-mark">ر</span>Rafiq</div>
          {NAV.map((n) => (
            <button key={n.route} className="nav-item" aria-current={route === n.route ? 'page' : undefined} onClick={() => go(n.route)}>
              <n.icon size={19} />
              {n.label}
            </button>
          ))}
          <div className="nav-spacer" />
          {!online && <div className="nav-item" style={{ cursor: 'default' }}><WifiOff size={18} />Offline</div>}
          <button className="nav-item" aria-current={route === 'settings' ? 'page' : undefined} onClick={() => go('settings')}>
            <SettingsIcon size={19} />
            Settings & backup
          </button>
        </nav>
        <main className="main">
          <div className="row between mobile-only" style={{ position: 'absolute', right: 12, top: 'max(14px, env(safe-area-inset-top))', zIndex: 4 }}>
            {!online && <span className="badge"><WifiOff size={12} />Offline</span>}
            <button className="icon-btn" aria-label="Settings and backup" onClick={() => go('settings')}><SettingsIcon size={20} /></button>
          </div>
          {page}
        </main>
      </div>
      {route !== 'rafiq' && data.accounts.length > 0 && !sheet && (
        <button className="fab" aria-label="Add transaction" onClick={() => openSheet({ kind: 'transaction' })}>
          <Plus size={26} />
        </button>
      )}
      <nav className="bottom-nav" aria-label="Main">
        {NAV.map((n) => (
          <button key={n.route} aria-current={route === n.route ? 'page' : undefined} onClick={() => go(n.route)} className={n.route === 'rafiq' ? 'rafiq-tab' : ''}>
            {n.route === 'rafiq' ? <span className="dot"><n.icon size={18} /></span> : <n.icon size={21} />}
            {n.label}
          </button>
        ))}
      </nav>
      <Sheets />
      {toastMsg && <div className="toast" role="status">{toastMsg}</div>}
    </ErrorBoundary>
  );
}

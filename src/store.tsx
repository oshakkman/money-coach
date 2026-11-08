// App-wide data store. Every change is written to IndexedDB immediately
// (auto-save) and then reflected in the UI.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DataCorruptionError, deleteRecord, loadAll, putRecord, putSettings, replaceAll as dbReplaceAll, saveSnapshot } from './lib/db';
import { todayISO } from './lib/dates';
import { round } from './lib/money';
import type { Occurrence } from './lib/finance';
import type { ActionItem, DataSet, ISODate, Settings, StoreName, Transaction } from './lib/types';

export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);
export const nowISO = () => new Date().toISOString();

type Status = { kind: 'loading' } | { kind: 'ready' } | { kind: 'error'; error: Error };

export type SheetState =
  | { kind: 'transaction'; tx?: Transaction; preset?: Partial<Transaction> }
  | { kind: 'account'; id?: string }
  | { kind: 'recurring'; id?: string; preset?: { kind?: 'income' | 'expense'; frequency?: 'once' } }
  | { kind: 'debt'; id?: string }
  | { kind: 'debt-payment'; debtId: string }
  | { kind: 'goal'; id?: string }
  | { kind: 'goal-contribution'; goalId: string }
  | { kind: 'budget'; category?: string }
  | { kind: 'settle'; occurrence: Occurrence }
  | { kind: 'backup' }
  | { kind: 'restore' }
  | { kind: 'action'; id?: string };

interface Store {
  data: DataSet;
  getData: () => DataSet;
  today: ISODate;
  status: Status;
  put: (store: StoreName, item: object) => Promise<void>;
  remove: (store: StoreName, key: string) => Promise<void>;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  saveTransaction: (tx: Transaction, previous?: Transaction) => Promise<void>;
  deleteTransaction: (tx: Transaction) => Promise<void>;
  settle: (o: Occurrence, opts: { record: boolean; amount: number; accountId?: string; date: ISODate }) => Promise<void>;
  addActions: (items: Omit<ActionItem, 'id' | 'createdAt' | 'status'>[]) => Promise<void>;
  setActionStatus: (id: string, status: ActionItem['status']) => Promise<void>;
  replaceAll: (data: DataSet, reason: string) => Promise<void>;
  reload: () => Promise<void>;
  sheet: SheetState | null;
  openSheet: (s: SheetState) => void;
  closeSheet: () => void;
  toast: (msg: string) => void;
  toastMsg: string | null;
}

const Ctx = createContext<Store | null>(null);

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore outside provider');
  return s;
}

const EMPTY: DataSet = {
  settings: { id: 'settings', currency: 'JOD', buffer: 0, onboardingDismissed: false, welcomeDone: false, aiConsent: false, useAiByDefault: false, theme: 'system' },
  accounts: [],
  transactions: [],
  recurring: [],
  debts: [],
  goals: [],
  budgets: [],
  actions: [],
  conversations: [],
};

const keyOf = (store: StoreName, item: object) => (store === 'budgets' ? (item as { category: string }).category : (item as { id: string }).id);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<DataSet>(EMPTY);
  const dataRef = useRef(data);
  const [status, setStatus] = useState<Status>({ kind: 'loading' });
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const [toastMsg, setToast] = useState<string | null>(null);
  const [today, setToday] = useState(todayISO());

  const reload = useCallback(async () => {
    try {
      const loaded = await loadAll();
      dataRef.current = loaded;
      setData(loaded);
      setStatus({ kind: 'ready' });
    } catch (e) {
      setStatus({ kind: 'error', error: e instanceof DataCorruptionError ? e : new Error((e as Error).message || 'Could not open local database') });
    }
  }, []);

  useEffect(() => {
    reload();
    // Keep "today" correct if the app stays open past midnight.
    const t = setInterval(() => setToday(todayISO()), 60_000);
    return () => clearInterval(t);
  }, [reload]);

  const toast = useCallback((msg: string) => {
    setToast(msg);
    window.clearTimeout((toast as unknown as { t?: number }).t);
    (toast as unknown as { t?: number }).t = window.setTimeout(() => setToast(null), 2600);
  }, []);

  // dataRef is updated synchronously so chained updates always see fresh data.
  const commit = useCallback((next: DataSet) => {
    dataRef.current = next;
    setData(next);
  }, []);

  const put = useCallback(
    async (store: StoreName, item: object) => {
      await putRecord(store, item);
      const d = dataRef.current;
      const list = d[store] as object[];
      const k = keyOf(store, item);
      const idx = list.findIndex((x) => keyOf(store, x) === k);
      const nextList = idx >= 0 ? list.map((x, i) => (i === idx ? item : x)) : [...list, item];
      commit({ ...d, [store]: nextList });
    },
    [commit],
  );

  const remove = useCallback(
    async (store: StoreName, key: string) => {
      await deleteRecord(store, key);
      const d = dataRef.current;
      commit({ ...d, [store]: (d[store] as object[]).filter((x) => keyOf(store, x) !== key) });
    },
    [commit],
  );

  const updateSettings = useCallback(
    async (patch: Partial<Settings>) => {
      const next = { ...dataRef.current.settings, ...patch };
      await putSettings(next);
      commit({ ...dataRef.current, settings: next });
    },
    [commit],
  );

  /** Applies (+1) or reverses (-1) a transaction's effect on debts and goals. */
  const applyLinked = useCallback(
    async (tx: Transaction, sign: 1 | -1) => {
      const d = dataRef.current;
      if (tx.debtId) {
        const debt = d.debts.find((x) => x.id === tx.debtId);
        if (debt) {
          const balance = Math.max(0, round(debt.balance - sign * tx.amount));
          await put('debts', { ...debt, balance, closedAt: balance === 0 ? debt.closedAt ?? nowISO() : undefined });
        }
      }
      if (tx.goalId) {
        const goal = dataRef.current.goals.find((x) => x.id === tx.goalId);
        if (goal) {
          const saved = Math.max(0, round(goal.saved + sign * tx.amount));
          await put('goals', { ...goal, saved, completedAt: saved >= goal.target ? goal.completedAt ?? nowISO() : undefined });
        }
      }
    },
    [put],
  );

  const saveTransaction = useCallback(
    async (tx: Transaction, previous?: Transaction) => {
      if (previous) await applyLinked(previous, -1);
      await put('transactions', tx);
      await applyLinked(tx, 1);
    },
    [put, applyLinked],
  );

  const deleteTransaction = useCallback(
    async (tx: Transaction) => {
      await remove('transactions', tx.id);
      await applyLinked(tx, -1);
    },
    [remove, applyLinked],
  );

  const settle = useCallback(
    async (o: Occurrence, opts: { record: boolean; amount: number; accountId?: string; date: ISODate }) => {
      const d = dataRef.current;
      if (o.source === 'recurring') {
        const r = d.recurring.find((x) => x.id === o.sourceId);
        if (!r) return;
        await put('recurring', { ...r, settledThrough: o.date, active: r.frequency === 'once' ? false : r.active });
        if (opts.record && opts.accountId) {
          await saveTransaction({
            id: uid(),
            date: opts.date,
            type: r.kind,
            amount: opts.amount,
            category: r.category,
            accountId: opts.accountId,
            note: r.name,
            recurringId: r.id,
            createdAt: nowISO(),
            updatedAt: nowISO(),
          });
        }
      } else {
        const debt = d.debts.find((x) => x.id === o.sourceId);
        if (!debt) return;
        await put('debts', { ...debt, settledThrough: o.date });
        if (opts.record && opts.accountId) {
          await saveTransaction({
            id: uid(),
            date: opts.date,
            type: 'expense',
            amount: opts.amount,
            category: 'Debt payment',
            accountId: opts.accountId,
            note: debt.name,
            debtId: debt.id,
            createdAt: nowISO(),
            updatedAt: nowISO(),
          });
        }
      }
    },
    [put, saveTransaction],
  );

  const addActions = useCallback(
    async (items: Omit<ActionItem, 'id' | 'createdAt' | 'status'>[]) => {
      for (const it of items) await put('actions', { ...it, id: uid(), createdAt: nowISO(), status: 'open' });
    },
    [put],
  );

  const setActionStatus = useCallback(
    async (id: string, status: ActionItem['status']) => {
      const a = dataRef.current.actions.find((x) => x.id === id);
      if (a) await put('actions', { ...a, status, completedAt: status === 'open' ? undefined : nowISO() });
    },
    [put],
  );

  const replaceAll = useCallback(
    async (next: DataSet, reason: string) => {
      // Always keep a safety copy of what is being replaced.
      await saveSnapshot(dataRef.current, reason);
      await dbReplaceAll(next);
      commit(next);
      setStatus({ kind: 'ready' });
    },
    [commit],
  );

  const value = useMemo<Store>(
    () => ({
      data,
      getData: () => dataRef.current,
      today,
      status,
      put,
      remove,
      updateSettings,
      saveTransaction,
      deleteTransaction,
      settle,
      addActions,
      setActionStatus,
      replaceAll,
      reload,
      sheet,
      openSheet: setSheet,
      closeSheet: () => setSheet(null),
      toast,
      toastMsg,
    }),
    [data, today, status, put, remove, updateSettings, saveTransaction, deleteTransaction, settle, addActions, setActionStatus, replaceAll, reload, sheet, toast, toastMsg],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}


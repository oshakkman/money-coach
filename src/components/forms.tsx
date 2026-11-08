import { useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Field, Segmented, Sheet, Switch, confirmAction, useMoney } from './ui';
import { nowISO, uid, useStore } from '../store';
import { parseAmount } from '../lib/money';
import { addDays, formatDate } from '../lib/dates';
import { upcomingCommitments, type Occurrence } from '../lib/finance';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, ESSENTIAL_CATEGORIES, type AccountType, type Frequency, type Transaction, type TxType } from '../lib/types';
import { BackupSheet, RestoreSheet } from './BackupSheets';

/** Amount text box: accepts "12.5", "1,250" etc. */
function AmountInput({ id, value, onChange, big, autoFocus }: { id: string; value: string; onChange: (v: string) => void; big?: boolean; autoFocus?: boolean }) {
  return (
    <input
      id={id}
      className={`input ${big ? 'big' : ''}`}
      inputMode="decimal"
      autoComplete="off"
      placeholder="0"
      value={value}
      autoFocus={autoFocus}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

const amountError = (s: string, allowZero = false) => {
  const n = parseAmount(s);
  if (Number.isNaN(n)) return 'Enter an amount';
  if (n < 0 || (!allowZero && n === 0)) return allowZero ? 'Cannot be negative' : 'Must be more than zero';
  if (n > 1e9) return 'Too large';
  return null;
};

function useCategories() {
  const { data } = useStore();
  return useMemo(() => {
    const used = new Set(data.transactions.map((t) => t.category));
    data.budgets.forEach((b) => used.add(b.category));
    data.recurring.forEach((r) => used.add(r.category));
    return {
      expense: [...new Set([...EXPENSE_CATEGORIES, ...[...used].filter((c) => !INCOME_CATEGORIES.includes(c) && c !== 'Transfer')])],
      income: INCOME_CATEGORIES,
    };
  }, [data]);
}

// ------------------------------------------------------------ transaction

function TransactionSheet({ tx, preset }: { tx?: Transaction; preset?: Partial<Transaction> }) {
  const { data, saveTransaction, deleteTransaction, closeSheet, openSheet, toast, today } = useStore();
  const cats = useCategories();
  const accounts = data.accounts.filter((a) => !a.archived);
  const base = tx ?? preset ?? {};
  const [type, setType] = useState<TxType>(base.type ?? 'expense');
  const [amount, setAmount] = useState(base.amount ? String(base.amount) : '');
  const [category, setCategory] = useState(base.category ?? (base.type === 'income' ? 'Salary' : 'Groceries'));
  const [date, setDate] = useState(base.date ?? today);
  const [accountId, setAccountId] = useState(base.accountId ?? accounts.find((a) => a.type !== 'savings')?.id ?? accounts[0]?.id ?? '');
  const [toAccountId, setTo] = useState(base.toAccountId ?? accounts.find((a) => a.id !== accountId)?.id ?? '');
  const [note, setNote] = useState(base.note ?? '');
  const [tried, setTried] = useState(false);
  const err = amountError(amount);
  const catList = type === 'income' ? cats.income : cats.expense;

  if (!accounts.length) {
    return (
      <Sheet title="Add a transaction" onClose={closeSheet}>
        <p className="muted">Add an account balance first (cash or bank), so Rafiq knows where money moves from.</p>
        <div className="sheet-actions">
          <button className="btn primary" onClick={() => openSheet({ kind: 'account' })}>Add account</button>
        </div>
      </Sheet>
    );
  }

  const save = async () => {
    setTried(true);
    if (err || !accountId || (type === 'transfer' && (!toAccountId || toAccountId === accountId))) return;
    const t: Transaction = {
      id: tx?.id ?? uid(),
      date,
      type,
      amount: parseAmount(amount),
      category: type === 'transfer' ? 'Transfer' : category,
      accountId,
      toAccountId: type === 'transfer' ? toAccountId : undefined,
      note: note.trim() || undefined,
      recurringId: base.recurringId,
      debtId: base.debtId,
      goalId: base.goalId,
      createdAt: tx?.createdAt ?? nowISO(),
      updatedAt: nowISO(),
    };
    await saveTransaction(t, tx);
    toast(tx ? 'Transaction updated' : 'Saved');
    closeSheet();
  };

  return (
    <Sheet
      title={tx ? 'Edit transaction' : 'Add transaction'}
      onClose={closeSheet}
      footer={
        <>
          {tx && (
            <button
              className="btn danger"
              style={{ flex: 'none' }}
              aria-label="Delete transaction"
              onClick={async () => {
                if (!confirmAction('Delete this transaction?')) return;
                await deleteTransaction(tx);
                toast('Deleted');
                closeSheet();
              }}
            >
              <Trash2 size={18} />
            </button>
          )}
          <button className="btn primary" onClick={save}>
            {tx ? 'Save changes' : 'Save'}
          </button>
        </>
      }
    >
      <div className="stack">
        <Segmented
          label="Type"
          value={type}
          onChange={(v) => {
            setType(v);
            if (v === 'income') setCategory('Salary');
            else if (v === 'expense' && INCOME_CATEGORIES.includes(category)) setCategory('Groceries');
          }}
          options={[
            { value: 'expense', label: 'Expense' },
            { value: 'income', label: 'Income' },
            { value: 'transfer', label: 'Transfer' },
          ]}
        />
        <Field label={`Amount (${data.settings.currency})`} error={tried ? err : null}>
          {(id) => <AmountInput id={id} value={amount} onChange={setAmount} big autoFocus={!tx} />}
        </Field>
        <div className="form-grid">
          {type !== 'transfer' && (
            <Field label="Category">
              {(id) => (
                <select id={id} className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
                  {catList.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              )}
            </Field>
          )}
          <Field label="Date">{(id) => <input id={id} type="date" className="input" value={date} max="2100-12-31" onChange={(e) => setDate(e.target.value || today)} />}</Field>
          <Field label={type === 'transfer' ? 'From' : 'Account'}>
            {(id) => (
              <select id={id} className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            )}
          </Field>
          {type === 'transfer' && (
            <Field label="To" error={tried && toAccountId === accountId ? 'Choose a different account' : null}>
              {(id) => (
                <select id={id} className="input" value={toAccountId} onChange={(e) => setTo(e.target.value)}>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              )}
            </Field>
          )}
          <Field label="Note (optional)" full>
            {(id) => <input id={id} className="input" value={note} maxLength={120} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Carrefour" />}
          </Field>
        </div>
        {(base.debtId || base.goalId) && <p className="faint xs">Linked to a {base.debtId ? 'debt' : 'savings goal'} — editing or deleting updates its balance too.</p>}
      </div>
    </Sheet>
  );
}

// ------------------------------------------------------------ account

function AccountSheet({ id }: { id?: string }) {
  const { data, put, closeSheet, toast, today, remove } = useStore();
  const existing = data.accounts.find((a) => a.id === id);
  const [name, setName] = useState(existing?.name ?? '');
  const [type, setType] = useState<AccountType>(existing?.type ?? 'bank');
  const [balance, setBalance] = useState(existing ? String(existing.openingBalance) : '');
  const [date, setDate] = useState(existing?.openingDate ?? today);
  const [tried, setTried] = useState(false);
  const err = Number.isNaN(parseAmount(balance)) ? 'Enter the current balance (0 is fine)' : null;
  const hasTx = existing && data.transactions.some((t) => t.accountId === existing.id || t.toAccountId === existing.id);
  const save = async () => {
    setTried(true);
    if (err || !name.trim()) return;
    await put('accounts', {
      id: existing?.id ?? uid(),
      name: name.trim(),
      type,
      openingBalance: parseAmount(balance),
      openingDate: date,
      createdAt: existing?.createdAt ?? nowISO(),
    });
    toast('Account saved');
    closeSheet();
  };
  return (
    <Sheet
      title={existing ? 'Edit account' : 'Add account balance'}
      onClose={closeSheet}
      footer={
        <>
          {existing && (
            <button
              className="btn danger"
              style={{ flex: 'none' }}
              onClick={async () => {
                if (hasTx) {
                  if (!confirmAction('This account has transactions. Archive it (hide it and exclude its balance)?')) return;
                  await put('accounts', { ...existing, archived: true });
                } else {
                  if (!confirmAction('Delete this account?')) return;
                  await remove('accounts', existing.id);
                }
                closeSheet();
              }}
            >
              <Trash2 size={18} />
            </button>
          )}
          <button className="btn primary" onClick={save}>Save</button>
        </>
      }
    >
      <div className="stack">
        <Field label="Name" error={tried && !name.trim() ? 'Give it a name' : null}>
          {(id) => <input id={id} className="input" value={name} autoFocus={!existing} onChange={(e) => setName(e.target.value)} placeholder="e.g. Arab Bank, Cash wallet" />}
        </Field>
        <Segmented
          label="Account type"
          value={type}
          onChange={setType}
          options={[
            { value: 'bank', label: 'Bank' },
            { value: 'cash', label: 'Cash' },
            { value: 'wallet', label: 'e-Wallet' },
            { value: 'savings', label: 'Savings' },
          ]}
        />
        <div className="form-grid">
          <Field label={`Balance (${data.settings.currency})`} error={tried ? err : null}>
            {(id) => <AmountInput id={id} value={balance} onChange={setBalance} />}
          </Field>
          <Field label="As of date" hint="Transactions before this date are already in the balance.">
            {(id) => <input id={id} type="date" className="input" value={date} onChange={(e) => setDate(e.target.value || today)} />}
          </Field>
        </div>
        {type === 'savings' && <p className="faint small">Savings accounts are not counted in “safe to spend”.</p>}
        {existing && <p className="faint small">To correct a balance today, change the balance and set the date to today. Older transactions stay in your history.</p>}
      </div>
    </Sheet>
  );
}

// ------------------------------------------------------------ recurring income / bill / commitment

function RecurringSheet({ id, preset }: { id?: string; preset?: { kind?: 'income' | 'expense'; frequency?: 'once' } }) {
  const { data, put, remove, closeSheet, toast, today } = useStore();
  const cats = useCategories();
  const ex = data.recurring.find((r) => r.id === id);
  const [kind, setKind] = useState<'income' | 'expense'>(ex?.kind ?? preset?.kind ?? 'expense');
  const [name, setName] = useState(ex?.name ?? '');
  const [amount, setAmount] = useState(ex ? String(ex.amount) : '');
  const [frequency, setFrequency] = useState<Frequency>(ex?.frequency ?? preset?.frequency ?? 'monthly');
  const [startDate, setStart] = useState(ex?.startDate ?? today);
  const [category, setCategory] = useState(ex?.category ?? (kind === 'income' ? 'Salary' : 'Housing'));
  const [essential, setEssential] = useState(ex?.essential ?? true);
  const [accountId, setAccountId] = useState(ex?.accountId ?? data.accounts.find((a) => a.type !== 'savings')?.id ?? '');
  const [tried, setTried] = useState(false);
  const err = amountError(amount);
  const save = async () => {
    setTried(true);
    if (err || !name.trim()) return;
    const isNew = !ex;
    await put('recurring', {
      id: ex?.id ?? uid(),
      name: name.trim(),
      kind,
      amount: parseAmount(amount),
      category,
      frequency,
      startDate,
      essential: kind === 'income' ? true : essential,
      accountId: accountId || undefined,
      // For a new item whose first date has passed, treat past dates as settled.
      settledThrough: isNew ? (startDate < today ? addDays(today, -1) : undefined) : ex?.settledThrough,
      active: true,
      createdAt: ex?.createdAt ?? nowISO(),
    });
    toast('Saved');
    closeSheet();
  };
  const title = ex ? 'Edit' : kind === 'income' ? 'Add income' : frequency === 'once' ? 'Add expected commitment' : 'Add regular bill';
  return (
    <Sheet
      title={title}
      onClose={closeSheet}
      footer={
        <>
          {ex && (
            <button
              className="btn danger"
              style={{ flex: 'none' }}
              onClick={async () => {
                if (!confirmAction(`Delete "${ex.name}"? Past transactions are kept.`)) return;
                await remove('recurring', ex.id);
                closeSheet();
              }}
            >
              <Trash2 size={18} />
            </button>
          )}
          <button className="btn primary" onClick={save}>Save</button>
        </>
      }
    >
      <div className="stack">
        {!ex && (
          <Segmented
            label="Kind"
            value={kind}
            onChange={(v) => {
              setKind(v);
              setCategory(v === 'income' ? 'Salary' : 'Housing');
            }}
            options={[
              { value: 'expense', label: 'Bill / commitment' },
              { value: 'income', label: 'Income' },
            ]}
          />
        )}
        <div className="form-grid">
          <Field label="Name" full error={tried && !name.trim() ? 'Give it a name' : null}>
            {(id) => <input id={id} className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === 'income' ? 'e.g. Salary' : 'e.g. Rent, School fees'} />}
          </Field>
          <Field label={`Amount (${data.settings.currency})`} error={tried ? err : null}>
            {(id) => <AmountInput id={id} value={amount} onChange={setAmount} />}
          </Field>
          <Field label="How often">
            {(id) => (
              <select id={id} className="input" value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)}>
                <option value="monthly">Monthly</option>
                <option value="weekly">Weekly</option>
                <option value="biweekly">Every 2 weeks</option>
                <option value="yearly">Yearly</option>
                <option value="once">One time</option>
              </select>
            )}
          </Field>
          <Field label={frequency === 'once' ? 'Due date' : kind === 'income' ? 'Next or last payday' : 'Next or last due date'} hint={startDate < today && !ex ? 'Past dates are treated as already paid.' : frequency === 'monthly' ? 'The day of the month repeats.' : undefined}>
            {(id) => <input id={id} type="date" className="input" value={startDate} onChange={(e) => setStart(e.target.value || today)} />}
          </Field>
          <Field label="Category">
            {(id) => (
              <select
                id={id}
                className="input"
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value);
                  if (kind === 'expense') setEssential(ESSENTIAL_CATEGORIES.has(e.target.value));
                }}
              >
                {(kind === 'income' ? cats.income : cats.expense).map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            )}
          </Field>
          {data.accounts.length > 0 && (
            <Field label={kind === 'income' ? 'Paid into' : 'Paid from'} full>
              {(id) => (
                <select id={id} className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                  {data.accounts.filter((a) => !a.archived).map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              )}
            </Field>
          )}
        </div>
        {kind === 'expense' && <Switch checked={essential} onChange={setEssential} label="Essential" hint="Must be paid (rent, utilities, school). Rafiq protects these first." />}
      </div>
    </Sheet>
  );
}

// ------------------------------------------------------------ debt

function DebtSheet({ id }: { id?: string }) {
  const { data, put, remove, closeSheet, toast } = useStore();
  const ex = data.debts.find((d) => d.id === id);
  const [name, setName] = useState(ex?.name ?? '');
  const [balance, setBalance] = useState(ex ? String(ex.balance) : '');
  const [original, setOriginal] = useState(ex ? String(ex.originalBalance) : '');
  const [apr, setApr] = useState(ex ? String(ex.apr) : '');
  const [minPayment, setMin] = useState(ex ? String(ex.minPayment) : '');
  const [dueDay, setDueDay] = useState(ex ? String(ex.dueDay) : '1');
  const [tried, setTried] = useState(false);
  const errs = {
    name: !name.trim() ? 'Give it a name' : null,
    balance: amountError(balance, true),
    apr: Number.isNaN(parseAmount(apr)) || parseAmount(apr) > 200 ? 'Enter the yearly rate, e.g. 18 (0 if none)' : null,
    min: amountError(minPayment, true),
    due: !(Number(dueDay) >= 1 && Number(dueDay) <= 31) ? '1–31' : null,
  };
  const save = async () => {
    setTried(true);
    if (Object.values(errs).some(Boolean)) return;
    const bal = parseAmount(balance);
    const orig = original ? parseAmount(original) : NaN;
    await put('debts', {
      id: ex?.id ?? uid(),
      name: name.trim(),
      balance: bal,
      originalBalance: Number.isNaN(orig) ? (ex ? Math.max(ex.originalBalance, bal) : bal) : Math.max(orig, bal),
      apr: parseAmount(apr),
      minPayment: parseAmount(minPayment),
      dueDay: Number(dueDay),
      createdAt: ex?.createdAt ?? nowISO(),
      settledThrough: ex?.settledThrough,
      closedAt: bal === 0 ? ex?.closedAt ?? nowISO() : undefined,
    });
    toast('Debt saved');
    closeSheet();
  };
  return (
    <Sheet
      title={ex ? 'Edit debt' : 'Add debt'}
      onClose={closeSheet}
      footer={
        <>
          {ex && (
            <button className="btn danger" style={{ flex: 'none' }} onClick={async () => { if (confirmAction(`Delete "${ex.name}"? Its payment history stays in Transactions.`)) { await remove('debts', ex.id); closeSheet(); } }}>
              <Trash2 size={18} />
            </button>
          )}
          <button className="btn primary" onClick={save}>Save</button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Name" full error={tried ? errs.name : null}>{(id) => <input id={id} className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Credit card, Car loan" />}</Field>
        <Field label={`Balance owed now (${data.settings.currency})`} error={tried ? errs.balance : null}>{(id) => <AmountInput id={id} value={balance} onChange={setBalance} />}</Field>
        <Field label="Original amount (optional)" hint="For progress tracking.">{(id) => <AmountInput id={id} value={original} onChange={setOriginal} />}</Field>
        <Field label="Interest rate (% per year)" error={tried ? errs.apr : null}>{(id) => <input id={id} className="input" inputMode="decimal" value={apr} onChange={(e) => setApr(e.target.value)} placeholder="e.g. 18" />}</Field>
        <Field label="Minimum payment / month" error={tried ? errs.min : null}>{(id) => <AmountInput id={id} value={minPayment} onChange={setMin} />}</Field>
        <Field label="Due day of month" error={tried ? errs.due : null}>{(id) => <input id={id} className="input" inputMode="numeric" value={dueDay} onChange={(e) => setDueDay(e.target.value.replace(/\D/g, ''))} />}</Field>
      </div>
      {ex && <p className="faint small" style={{ marginTop: 12 }}>Interest is not added automatically. Update the balance from your statement each month to keep timelines exact.</p>}
    </Sheet>
  );
}

function DebtPaymentSheet({ debtId }: { debtId: string }) {
  const { data, getData, saveTransaction, put, closeSheet, toast, today } = useStore();
  const m = useMoney();
  const debt = data.debts.find((d) => d.id === debtId)!;
  const accounts = data.accounts.filter((a) => !a.archived);
  const [amount, setAmount] = useState(String(Math.min(debt.minPayment, debt.balance) || ''));
  const [accountId, setAccountId] = useState(accounts.find((a) => a.type !== 'savings')?.id ?? accounts[0]?.id ?? '');
  const [date, setDate] = useState(today);
  const [tried, setTried] = useState(false);
  const err = amountError(amount) ?? (parseAmount(amount) > debt.balance + 0.001 ? `More than the ${m(debt.balance)} owed` : null);
  const save = async () => {
    setTried(true);
    if (err || !accountId) return;
    const amt = parseAmount(amount);
    // A payment of at least the minimum settles the next unpaid due date.
    const nextDue = upcomingCommitments(getData(), today, addDays(today, 62)).find((o) => o.sourceId === debt.id);
    await saveTransaction({ id: uid(), date, type: 'expense', amount: amt, category: 'Debt payment', accountId, note: debt.name, debtId: debt.id, createdAt: nowISO(), updatedAt: nowISO() });
    const fresh = getData().debts.find((d) => d.id === debt.id);
    if (fresh && nextDue && amt >= Math.min(debt.minPayment, debt.balance) - 0.001) await put('debts', { ...fresh, settledThrough: nextDue.date });
    toast('Payment recorded');
    closeSheet();
  };
  return (
    <Sheet title={`Pay ${debt.name}`} onClose={closeSheet} footer={<button className="btn primary" onClick={save}>Record payment</button>}>
      <div className="stack">
        <p className="muted small">Owed: {m(debt.balance)} · Minimum {m(debt.minPayment)} due day {debt.dueDay}</p>
        <Field label={`Amount (${data.settings.currency})`} error={tried ? err : null}>{(id) => <AmountInput id={id} value={amount} onChange={setAmount} big />}</Field>
        <div className="form-grid">
          <Field label="Paid from">
            {(id) => (
              <select id={id} className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            )}
          </Field>
          <Field label="Date">{(id) => <input id={id} type="date" className="input" value={date} onChange={(e) => setDate(e.target.value || today)} />}</Field>
        </div>
      </div>
    </Sheet>
  );
}

// ------------------------------------------------------------ goals

function GoalSheet({ id }: { id?: string }) {
  const { data, put, remove, closeSheet, toast } = useStore();
  const ex = data.goals.find((g) => g.id === id);
  const [name, setName] = useState(ex?.name ?? '');
  const [target, setTarget] = useState(ex ? String(ex.target) : '');
  const [saved, setSaved] = useState(ex ? String(ex.saved) : '0');
  const [monthly, setMonthly] = useState(ex ? String(ex.monthlyContribution) : '');
  const [targetDate, setTargetDate] = useState(ex?.targetDate ?? '');
  const [tried, setTried] = useState(false);
  const errs = { name: !name.trim() ? 'Give it a name' : null, target: amountError(target), saved: amountError(saved, true), monthly: amountError(monthly || '0', true) };
  const save = async () => {
    setTried(true);
    if (Object.values(errs).some(Boolean)) return;
    const s = parseAmount(saved);
    const t = parseAmount(target);
    await put('goals', {
      id: ex?.id ?? uid(),
      name: name.trim(),
      target: t,
      saved: s,
      monthlyContribution: parseAmount(monthly || '0'),
      targetDate: targetDate || undefined,
      priority: ex?.priority ?? 'normal',
      createdAt: ex?.createdAt ?? nowISO(),
      completedAt: s >= t ? ex?.completedAt ?? nowISO() : undefined,
    });
    toast('Goal saved');
    closeSheet();
  };
  return (
    <Sheet
      title={ex ? 'Edit goal' : 'Add savings goal'}
      onClose={closeSheet}
      footer={
        <>
          {ex && <button className="btn danger" style={{ flex: 'none' }} onClick={async () => { if (confirmAction(`Delete goal "${ex.name}"?`)) { await remove('goals', ex.id); closeSheet(); } }}><Trash2 size={18} /></button>}
          <button className="btn primary" onClick={save}>Save</button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Goal" full error={tried ? errs.name : null}>{(id) => <input id={id} className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Emergency fund" />}</Field>
        <Field label="Target amount" error={tried ? errs.target : null}>{(id) => <AmountInput id={id} value={target} onChange={setTarget} />}</Field>
        <Field label="Already saved" error={tried ? errs.saved : null}>{(id) => <AmountInput id={id} value={saved} onChange={setSaved} />}</Field>
        <Field label="Plan per month" hint="Reserved from safe-to-spend each pay period." error={tried ? errs.monthly : null}>{(id) => <AmountInput id={id} value={monthly} onChange={setMonthly} />}</Field>
        <Field label="Target date (optional)">{(id) => <input id={id} type="date" className="input" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />}</Field>
      </div>
    </Sheet>
  );
}

function GoalContributionSheet({ goalId }: { goalId: string }) {
  const { data, saveTransaction, closeSheet, toast, today } = useStore();
  const goal = data.goals.find((g) => g.id === goalId)!;
  const accounts = data.accounts.filter((a) => !a.archived);
  const savingsAcc = accounts.find((a) => a.type === 'savings');
  const [amount, setAmount] = useState(goal.monthlyContribution ? String(goal.monthlyContribution) : '');
  const [accountId, setAccountId] = useState(accounts.find((a) => a.type !== 'savings')?.id ?? '');
  const [mode, setMode] = useState<'expense' | 'transfer'>(savingsAcc ? 'transfer' : 'expense');
  const [tried, setTried] = useState(false);
  const err = amountError(amount);
  const save = async () => {
    setTried(true);
    if (err || !accountId) return;
    const amt = parseAmount(amount);
    if (mode === 'transfer' && savingsAcc) {
      await saveTransaction({ id: uid(), date: today, type: 'transfer', amount: amt, category: 'Transfer', accountId, toAccountId: savingsAcc.id, note: goal.name, createdAt: nowISO(), updatedAt: nowISO(), goalId: goal.id });
    } else {
      await saveTransaction({ id: uid(), date: today, type: 'expense', amount: amt, category: 'Savings', accountId, note: goal.name, goalId: goal.id, createdAt: nowISO(), updatedAt: nowISO() });
    }
    toast(`Added to ${goal.name}`);
    closeSheet();
  };
  return (
    <Sheet title={`Add to ${goal.name}`} onClose={closeSheet} footer={<button className="btn primary" onClick={save}>Save contribution</button>}>
      <div className="stack">
        <Field label="Amount" error={tried ? err : null}>{(id) => <AmountInput id={id} value={amount} onChange={setAmount} big autoFocus />}</Field>
        <Field label="From account">
          {(id) => (
            <select id={id} className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {accounts.filter((a) => a.type !== 'savings').map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          )}
        </Field>
        {savingsAcc && (
          <Segmented label="Where" value={mode} onChange={setMode} options={[{ value: 'transfer', label: `Move to ${savingsAcc.name}` }, { value: 'expense', label: 'Set aside elsewhere' }]} />
        )}
      </div>
    </Sheet>
  );
}

// ------------------------------------------------------------ budgets

function BudgetSheet({ category }: { category?: string }) {
  const { data, put, remove, closeSheet, toast } = useStore();
  const cats = useCategories();
  const ex = data.budgets.find((b) => b.category === category);
  const [cat, setCat] = useState(ex?.category ?? cats.expense.find((c) => !data.budgets.some((b) => b.category === c)) ?? 'Other');
  const [limit, setLimit] = useState(ex ? String(ex.monthlyLimit) : '');
  const [tried, setTried] = useState(false);
  const err = amountError(limit);
  const save = async () => {
    setTried(true);
    if (err) return;
    if (ex && ex.category !== cat) await remove('budgets', ex.category);
    await put('budgets', { category: cat, monthlyLimit: parseAmount(limit) });
    toast('Budget saved');
    closeSheet();
  };
  return (
    <Sheet
      title={ex ? 'Edit budget' : 'Add spending limit'}
      onClose={closeSheet}
      footer={
        <>
          {ex && <button className="btn danger" style={{ flex: 'none' }} onClick={async () => { await remove('budgets', ex.category); closeSheet(); }}><Trash2 size={18} /></button>}
          <button className="btn primary" onClick={save}>Save</button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Category">
          {(id) => (
            <select id={id} className="input" value={cat} onChange={(e) => setCat(e.target.value)}>
              {cats.expense.filter((c) => c === ex?.category || !data.budgets.some((b) => b.category === c)).map((c) => <option key={c}>{c}</option>)}
            </select>
          )}
        </Field>
        <Field label="Monthly limit" error={tried ? err : null}>{(id) => <AmountInput id={id} value={limit} onChange={setLimit} />}</Field>
      </div>
    </Sheet>
  );
}

// ------------------------------------------------------------ settle a bill / income

function SettleSheet({ occurrence: o }: { occurrence: Occurrence }) {
  const { data, settle, closeSheet, toast, today } = useStore();
  const accounts = data.accounts.filter((a) => !a.archived);
  const rec = data.recurring.find((r) => r.id === o.sourceId);
  const [record, setRecord] = useState(true);
  const [amount, setAmount] = useState(String(o.amount));
  const [accountId, setAccountId] = useState(rec?.accountId ?? accounts.find((a) => a.type !== 'savings')?.id ?? '');
  const [date, setDate] = useState(o.date > today ? today : o.date);
  const income = o.kind === 'income';
  const err = record ? amountError(amount) : null;
  const save = async () => {
    if (err) return;
    await settle(o, { record, amount: parseAmount(amount), accountId, date });
    toast(income ? 'Marked as received' : 'Marked as paid');
    closeSheet();
  };
  return (
    <Sheet title={`${o.name} — ${formatDate(o.date)}`} onClose={closeSheet} footer={<button className="btn primary" onClick={save}>{income ? 'Mark received' : 'Mark paid'}</button>}>
      <div className="stack">
        <Switch checked={record} onChange={setRecord} label={`Record as ${income ? 'income' : 'an expense'}`} hint={record ? 'Updates your balance.' : 'Turn off if you already recorded it as a transaction.'} />
        {record && (
          <div className="form-grid">
            <Field label="Amount" error={err}>{(id) => <AmountInput id={id} value={amount} onChange={setAmount} />}</Field>
            <Field label="Date">{(id) => <input id={id} type="date" className="input" value={date} onChange={(e) => setDate(e.target.value || today)} />}</Field>
            <Field label={income ? 'Into account' : 'From account'} full>
              {(id) => (
                <select id={id} className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              )}
            </Field>
          </div>
        )}
      </div>
    </Sheet>
  );
}

// ------------------------------------------------------------ action

function ActionSheet({ id }: { id?: string }) {
  const { data, put, remove, closeSheet, today } = useStore();
  const ex = data.actions.find((a) => a.id === id);
  const [title, setTitle] = useState(ex?.title ?? '');
  const [dueDate, setDue] = useState(ex?.dueDate ?? today);
  const save = async () => {
    if (!title.trim()) return;
    await put('actions', { ...(ex ?? { id: uid(), createdAt: nowISO(), status: 'open', source: 'manual' }), title: title.trim(), dueDate });
    closeSheet();
  };
  return (
    <Sheet
      title={ex ? 'Edit action' : 'New commitment'}
      onClose={closeSheet}
      footer={
        <>
          {ex && <button className="btn danger" style={{ flex: 'none' }} onClick={async () => { await remove('actions', ex.id); closeSheet(); }}><Trash2 size={18} /></button>}
          <button className="btn primary" onClick={save}>Save</button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="What will you do?" full>{(fid) => <input id={fid} className="input" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />}</Field>
        <Field label="By when">{(fid) => <input id={fid} type="date" className="input" value={dueDate} onChange={(e) => setDue(e.target.value || today)} />}</Field>
      </div>
    </Sheet>
  );
}

// ------------------------------------------------------------ router

export function Sheets() {
  const { sheet } = useStore();
  if (!sheet) return null;
  switch (sheet.kind) {
    case 'transaction':
      return <TransactionSheet key={sheet.tx?.id ?? 'new'} tx={sheet.tx} preset={sheet.preset} />;
    case 'account':
      return <AccountSheet id={sheet.id} />;
    case 'recurring':
      return <RecurringSheet id={sheet.id} preset={sheet.preset} />;
    case 'debt':
      return <DebtSheet id={sheet.id} />;
    case 'debt-payment':
      return <DebtPaymentSheet debtId={sheet.debtId} />;
    case 'goal':
      return <GoalSheet id={sheet.id} />;
    case 'goal-contribution':
      return <GoalContributionSheet goalId={sheet.goalId} />;
    case 'budget':
      return <BudgetSheet category={sheet.category} />;
    case 'settle':
      return <SettleSheet occurrence={sheet.occurrence} />;
    case 'backup':
      return <BackupSheet />;
    case 'restore':
      return <RestoreSheet />;
    case 'action':
      return <ActionSheet id={sheet.id} />;
  }
}

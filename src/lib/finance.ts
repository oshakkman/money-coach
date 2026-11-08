// Deterministic financial calculations. Pure functions only: no storage, no
// network, no AI. Every number Rafiq shows (online or offline) comes from here.
import { add, round, sub, sum, toMinor } from './money';
import {
  addDays,
  addMonthsClamped,
  diffDays,
  monthEnd,
  monthKey,
  monthStart,
  monthlyFactor,
  occurrences,
  parseISO,
  shiftMonth,
  daysInMonth,
  toISO,
} from './dates';
import type { Account, DataSet, Debt, Goal, ISODate, Recurring, Transaction } from './types';
import { ESSENTIAL_CATEGORIES } from './types';

const LOOKBACK_DAYS = 62; // how far back unpaid bills count as overdue

// ---------------------------------------------------------------- balances

export function accountBalance(account: Account, txs: Transaction[]): number {
  let total = toMinor(account.openingBalance);
  for (const t of txs) {
    // Transactions dated before the account's starting date are assumed to be
    // already reflected in the opening balance.
    if (t.date < account.openingDate) continue;
    const amt = toMinor(t.amount);
    if (t.accountId === account.id) {
      if (t.type === 'income') total += amt;
      else total -= amt; // expense or transfer out
    }
    if (t.type === 'transfer' && t.toAccountId === account.id) total += amt;
  }
  return total / 1000;
}

export function balances(data: Pick<DataSet, 'accounts' | 'transactions'>) {
  const active = data.accounts.filter((a) => !a.archived);
  const byAccount = active.map((a) => ({ account: a, balance: accountBalance(a, data.transactions) }));
  const spendable = sum(byAccount.filter((b) => b.account.type !== 'savings').map((b) => b.balance));
  const savings = sum(byAccount.filter((b) => b.account.type === 'savings').map((b) => b.balance));
  return { byAccount, spendable, savings, total: add(spendable, savings) };
}

// ---------------------------------------------------------------- schedules

export interface Occurrence {
  key: string; // unique: sourceId|date
  source: 'recurring' | 'debt';
  sourceId: string;
  name: string;
  kind: 'income' | 'expense';
  amount: number;
  date: ISODate;
  essential: boolean;
  category: string;
  overdue: boolean;
}

function recurringOccurrences(r: Recurring, from: ISODate, to: ISODate, today: ISODate): Occurrence[] {
  if (!r.active) return [];
  let start = from;
  if (r.settledThrough && addDays(r.settledThrough, 1) > start) start = addDays(r.settledThrough, 1);
  return occurrences(r.startDate, r.frequency, start, to).map((date) => ({
    key: `${r.id}|${date}`,
    source: 'recurring' as const,
    sourceId: r.id,
    name: r.name,
    kind: r.kind,
    amount: r.amount,
    date,
    essential: r.essential,
    category: r.category,
    overdue: date < today,
  }));
}

/** First due date for a debt: its due day in the month it was created (or next month if already passed). */
export function debtFirstDue(d: Debt): ISODate {
  const created = d.createdAt.slice(0, 10);
  const candidate = addMonthsClamped(monthStart(created), 0, d.dueDay);
  return candidate >= created ? candidate : addMonthsClamped(monthStart(created), 1, d.dueDay);
}

function debtOccurrences(d: Debt, from: ISODate, to: ISODate, today: ISODate): Occurrence[] {
  if (d.closedAt || d.balance <= 0 || d.minPayment <= 0) return [];
  let start = from;
  if (d.settledThrough && addDays(d.settledThrough, 1) > start) start = addDays(d.settledThrough, 1);
  return occurrences(debtFirstDue(d), 'monthly', start, to).map((date) => ({
    key: `${d.id}|${date}`,
    source: 'debt' as const,
    sourceId: d.id,
    name: `${d.name} (minimum)`,
    kind: 'expense' as const,
    amount: Math.min(d.minPayment, d.balance),
    date,
    essential: true,
    category: 'Debt payment',
    overdue: date < today,
  }));
}

/** Unsettled bills, commitments and debt minimums due up to `until` (overdue ones included). */
export function upcomingCommitments(data: DataSet, today: ISODate, until: ISODate): Occurrence[] {
  const from = addDays(today, -LOOKBACK_DAYS);
  const items = [
    ...data.recurring.filter((r) => r.kind === 'expense').flatMap((r) => recurringOccurrences(r, from, until, today)),
    ...data.debts.flatMap((d) => debtOccurrences(d, from, until, today)),
  ];
  return items.sort((a, b) => (a.date === b.date ? b.amount - a.amount : a.date < b.date ? -1 : 1));
}

export function expectedIncome(data: DataSet, today: ISODate, until: ISODate): Occurrence[] {
  return data.recurring
    .filter((r) => r.kind === 'income')
    .flatMap((r) => recurringOccurrences(r, addDays(today, -7), until, today))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

// ---------------------------------------------------------------- payday

export interface PaydayInfo {
  date: ISODate;
  source: 'income' | 'fallback' | 'month-end';
  name?: string;
  amount?: number;
  /** Start of the current pay period (previous payday or month start). */
  periodStart: ISODate;
  daysLeft: number;
}

export function nextPayday(data: DataSet, today: ISODate): PaydayInfo {
  const incomes = data.recurring.filter((r) => r.kind === 'income' && r.active);
  const salaryFirst = [...incomes].sort((a, b) => Number(b.category === 'Salary') - Number(a.category === 'Salary'));
  let best: { date: ISODate; r: Recurring } | null = null;
  for (const r of salaryFirst.length ? salaryFirst : []) {
    const next = occurrences(r.startDate, r.frequency, today, addDays(today, 400), 3).find(
      (d) => !(r.settledThrough && d <= r.settledThrough) && !(d === today && r.settledThrough === today),
    );
    // A payday that is still today but not marked received counts as today.
    if (next && (!best || next < best.date || (r.category === 'Salary' && best.r.category !== 'Salary' && next <= addDays(best.date, 3)))) {
      best = { date: next, r };
    }
  }
  if (best) {
    const r = best.r;
    let periodStart = monthStart(today);
    if (r.frequency === 'monthly') periodStart = addMonthsClamped(best.date, -1, parseISO(r.startDate).getDate());
    else if (r.frequency === 'weekly') periodStart = addDays(best.date, -7);
    else if (r.frequency === 'biweekly') periodStart = addDays(best.date, -14);
    else if (r.frequency === 'yearly') periodStart = addMonthsClamped(best.date, -12, parseISO(r.startDate).getDate());
    if (periodStart > today) periodStart = today;
    return { date: best.date, source: 'income', name: r.name, amount: r.amount, periodStart, daysLeft: Math.max(0, diffDays(today, best.date)) };
  }
  if (data.settings.fallbackPayday) {
    const day = data.settings.fallbackPayday;
    let date = addMonthsClamped(monthStart(today), 0, day);
    if (date <= today) date = addMonthsClamped(monthStart(today), 1, day);
    const periodStart = addMonthsClamped(date, -1, day);
    return { date, source: 'fallback', periodStart, daysLeft: diffDays(today, date) };
  }
  const end = addDays(monthEnd(today), 1);
  return { date: end, source: 'month-end', periodStart: monthStart(today), daysLeft: diffDays(today, end) };
}

// ---------------------------------------------------------------- safe to spend

export interface SafeToSpend {
  available: number;
  commitmentsTotal: number;
  commitments: Occurrence[];
  savingsReserve: number;
  buffer: number;
  safe: number;
  perDay: number;
  perWeek: number;
  payday: PaydayInfo;
  spentThisPeriod: number;
  recentDaily: number;
  status: 'healthy' | 'tight' | 'shortfall';
}

function isGoalContribution(t: Transaction) {
  return !!t.goalId || t.category === 'Savings';
}

/** Spending that is not a bill, debt payment or savings contribution. */
export function isDiscretionarySpend(t: Transaction, data: DataSet) {
  if (t.type !== 'expense' || t.recurringId || t.debtId || isGoalContribution(t)) return false;
  const essentialByRecurring = data.recurring.some((r) => r.category === t.category && r.essential && r.kind === 'expense');
  return !(ESSENTIAL_CATEGORIES.has(t.category) || essentialByRecurring);
}

export function goalReserve(data: DataSet, periodStart: ISODate, today: ISODate): number {
  const contributed = sum(
    data.transactions.filter((t) => t.goalId && t.date >= periodStart && t.date <= today).map((t) => t.amount),
  );
  const planned = sum(activeGoals(data.goals).map((g) => Math.min(g.monthlyContribution, Math.max(0, sub(g.target, g.saved)))));
  return Math.max(0, sub(planned, contributed));
}

export const activeGoals = (goals: Goal[]) => goals.filter((g) => !g.completedAt && g.saved < g.target);

export function safeToSpend(data: DataSet, today: ISODate): SafeToSpend {
  const { spendable } = balances(data);
  const payday = nextPayday(data, today);
  // Bills due before payday must be covered from current money. Bills due ON
  // payday are assumed to be paid from the incoming income.
  const commitments = upcomingCommitments(data, today, addDays(payday.date, -1));
  const commitmentsTotal = sum(commitments.map((c) => c.amount));
  const savingsReserve = goalReserve(data, payday.periodStart, today);
  const buffer = data.settings.buffer || 0;
  const safe = round(spendable - commitmentsTotal - savingsReserve - buffer);
  const days = Math.max(1, payday.daysLeft);
  const perDay = safe > 0 ? round(Math.floor((safe / days) * 1000) / 1000) : 0;
  const spentThisPeriod = sum(
    data.transactions
      .filter((t) => t.date >= payday.periodStart && t.date <= today && isDiscretionarySpend(t, data))
      .map((t) => t.amount),
  );
  const recentDaily = averageDailyVariableSpend(data, today);
  // Tight = what you may spend per day is below what you have actually been
  // spending per day recently (or, with no history, below 10% of balance).
  const status: SafeToSpend['status'] =
    safe < 0
      ? 'shortfall'
      : recentDaily > 0
        ? perDay < recentDaily
          ? 'tight'
          : 'healthy'
        : safe < spendable * 0.1
          ? 'tight'
          : 'healthy';
  return {
    available: spendable,
    commitmentsTotal,
    commitments,
    savingsReserve,
    buffer,
    safe,
    perDay,
    perWeek: round(perDay * 7),
    payday,
    spentThisPeriod,
    recentDaily,
    status,
  };
}

// ---------------------------------------------------------------- monthly summaries

export interface MonthSummary {
  month: string;
  income: number;
  spending: number; // expenses excluding savings contributions
  essential: number;
  discretionary: number;
  debtPayments: number;
  saved: number;
  net: number;
  byCategory: { category: string; amount: number }[];
}

export function monthSummary(data: DataSet, month: string): MonthSummary {
  const txs = data.transactions.filter((t) => monthKey(t.date) === month);
  const income = sum(txs.filter((t) => t.type === 'income').map((t) => t.amount));
  const expenses = txs.filter((t) => t.type === 'expense');
  const savedTx = expenses.filter(isGoalContribution);
  const spendTx = expenses.filter((t) => !isGoalContribution(t));
  const discretionaryTx = spendTx.filter((t) => isDiscretionarySpend(t, data));
  const spending = sum(spendTx.map((t) => t.amount));
  const discretionary = sum(discretionaryTx.map((t) => t.amount));
  const cats = new Map<string, number>();
  for (const t of spendTx) cats.set(t.category, (cats.get(t.category) ?? 0) + toMinor(t.amount));
  return {
    month,
    income,
    spending,
    discretionary,
    essential: sub(spending, discretionary),
    debtPayments: sum(spendTx.filter((t) => t.debtId || t.category === 'Debt payment').map((t) => t.amount)),
    saved: sum(savedTx.map((t) => t.amount)),
    net: round(income - spending - sum(savedTx.map((t) => t.amount))),
    byCategory: [...cats.entries()]
      .map(([category, v]) => ({ category, amount: v / 1000 }))
      .sort((a, b) => b.amount - a.amount),
  };
}

export function monthHistory(data: DataSet, endMonth: string, count: number): MonthSummary[] {
  const out: MonthSummary[] = [];
  for (let i = count - 1; i >= 0; i--) out.push(monthSummary(data, shiftMonth(endMonth, -i)));
  return out;
}

// ---------------------------------------------------------------- budgets

export interface BudgetStatus {
  category: string;
  limit: number;
  spent: number;
  remaining: number;
  pct: number;
  projected: number;
  state: 'ok' | 'warning' | 'over';
}

export function budgetStatus(data: DataSet, today: ISODate): BudgetStatus[] {
  const month = monthKey(today);
  const summary = monthSummary(data, month);
  const dim = daysInMonth(parseISO(today).getFullYear(), parseISO(today).getMonth());
  const day = parseISO(today).getDate();
  return data.budgets
    .filter((b) => b.monthlyLimit > 0)
    .map((b) => {
      const spent = summary.byCategory.find((c) => c.category === b.category)?.amount ?? 0;
      const projected = round((spent / day) * dim);
      const pct = b.monthlyLimit ? spent / b.monthlyLimit : 0;
      const state: BudgetStatus['state'] = spent > b.monthlyLimit ? 'over' : projected > b.monthlyLimit || pct >= 0.85 ? 'warning' : 'ok';
      return { category: b.category, limit: b.monthlyLimit, spent, remaining: sub(b.monthlyLimit, spent), pct, projected, state };
    })
    .sort((a, b) => b.pct - a.pct);
}

// ---------------------------------------------------------------- plan

export interface MonthlyPlan {
  income: number;
  essentialBills: number;
  discretionaryBills: number;
  debtMinimums: number;
  savings: number;
  variableBudgets: number;
  committed: number;
  unallocated: number;
  weeklyFlexible: number;
  allocation: { label: string; amount: number; kind: 'needs' | 'wants' | 'debt' | 'savings' | 'free' }[];
}

export function monthlyPlan(data: DataSet): MonthlyPlan {
  const perMonth = (r: Recurring) => round(r.amount * monthlyFactor(r.frequency));
  const active = data.recurring.filter((r) => r.active && r.frequency !== 'once');
  const income = sum(active.filter((r) => r.kind === 'income').map(perMonth));
  const exp = active.filter((r) => r.kind === 'expense');
  const essentialBills = sum(exp.filter((r) => r.essential).map(perMonth));
  const discretionaryBills = sum(exp.filter((r) => !r.essential).map(perMonth));
  const debtMinimums = sum(data.debts.filter((d) => !d.closedAt && d.balance > 0).map((d) => Math.min(d.minPayment, d.balance)));
  const savings = sum(activeGoals(data.goals).map((g) => g.monthlyContribution));
  // Budgets for categories that are not already covered by a recurring bill.
  const billCats = new Set(exp.map((r) => r.category));
  const variableBudgets = sum(data.budgets.filter((b) => !billCats.has(b.category)).map((b) => b.monthlyLimit));
  const committed = add(essentialBills, discretionaryBills, debtMinimums, savings, variableBudgets);
  const unallocated = sub(income, committed);
  const weeklyFlexible = round(Math.max(0, add(variableBudgets, Math.max(0, unallocated))) / (52 / 12));
  return {
    income,
    essentialBills,
    discretionaryBills,
    debtMinimums,
    savings,
    variableBudgets,
    committed,
    unallocated,
    weeklyFlexible,
    allocation: [
      { label: 'Essential bills', amount: essentialBills, kind: 'needs' as const },
      { label: 'Debt minimums', amount: debtMinimums, kind: 'debt' as const },
      { label: 'Savings goals', amount: savings, kind: 'savings' as const },
      { label: 'Other regular costs', amount: discretionaryBills, kind: 'wants' as const },
      { label: 'Day-to-day budgets', amount: variableBudgets, kind: 'wants' as const },
      { label: 'Unallocated', amount: Math.max(0, unallocated), kind: 'free' as const },
    ].filter((a) => a.amount > 0),
  };
}

// ---------------------------------------------------------------- cash-flow projection

export interface ProjectionPoint {
  date: ISODate;
  balance: number;
  events: { name: string; amount: number }[];
}

/** Average daily discretionary spend over the last `days` days (0 if too little history). */
export function averageDailyVariableSpend(data: DataSet, today: ISODate, days = 30): number {
  const from = addDays(today, -days + 1);
  const tx = data.transactions.filter((t) => t.date >= from && t.date <= today && isDiscretionarySpend(t, data));
  if (!tx.length) return 0;
  const first = tx.reduce((m, t) => (t.date < m ? t.date : m), today);
  const span = Math.max(7, diffDays(first, today) + 1);
  return round(sum(tx.map((t) => t.amount)) / span);
}

export function cashflowProjection(data: DataSet, today: ISODate, days: number, dailySpend: number): ProjectionPoint[] {
  const end = addDays(today, days);
  const outs = upcomingCommitments(data, today, end);
  const ins = expectedIncome(data, today, end).filter((o) => o.date >= today);
  let bal = toMinor(balances(data).spendable);
  const points: ProjectionPoint[] = [];
  for (let i = 0; i <= days; i++) {
    const date = addDays(today, i);
    const events: { name: string; amount: number }[] = [];
    for (const o of ins.filter((x) => x.date === date)) {
      bal += toMinor(o.amount);
      events.push({ name: o.name, amount: o.amount });
    }
    for (const o of outs.filter((x) => (i === 0 ? x.date <= date : x.date === date))) {
      bal -= toMinor(o.amount);
      events.push({ name: o.name, amount: -o.amount });
    }
    if (i > 0) bal -= toMinor(dailySpend);
    points.push({ date, balance: bal / 1000, events });
  }
  return points;
}

// ---------------------------------------------------------------- debt strategies

export type DebtStrategy = 'avalanche' | 'snowball';

export interface DebtSimulation {
  strategy: DebtStrategy;
  feasible: boolean;
  months: number;
  totalInterest: number;
  totalPaid: number;
  payoffOrder: { id: string; name: string; month: number }[];
  timeline: { month: number; total: number }[];
  firstMonthPlan: { id: string; name: string; payment: number }[];
}

export function orderDebts(debts: Debt[], strategy: DebtStrategy): Debt[] {
  return [...debts].sort((a, b) =>
    strategy === 'avalanche' ? b.apr - a.apr || a.balance - b.balance : a.balance - b.balance || b.apr - a.apr,
  );
}

/**
 * Month-by-month simulation. Each month: interest accrues (APR/12), every debt
 * receives its minimum, and the extra amount plus minimums freed by paid-off
 * debts goes to the target debt chosen by the strategy.
 */
export function simulateDebts(
  debtsIn: Debt[],
  extraMonthly: number,
  strategy: DebtStrategy,
  opts: { focusId?: string; maxMonths?: number } = {},
): DebtSimulation {
  const maxMonths = opts.maxMonths ?? 600;
  const debts = debtsIn
    .filter((d) => !d.closedAt && d.balance > 0)
    .map((d) => ({ ...d, bal: toMinor(d.balance), min: toMinor(d.minPayment), rate: d.apr / 100 / 12 }));
  const budget = debts.reduce((s, d) => s + d.min, 0) + toMinor(Math.max(0, extraMonthly));
  let interestTotal = 0;
  let paidTotal = 0;
  const payoffOrder: DebtSimulation['payoffOrder'] = [];
  const timeline: DebtSimulation['timeline'] = [{ month: 0, total: debts.reduce((s, d) => s + d.bal, 0) / 1000 }];
  const firstMonthPlan: DebtSimulation['firstMonthPlan'] = [];
  let month = 0;
  while (debts.some((d) => d.bal > 0) && month < maxMonths) {
    month++;
    let pool = budget;
    for (const d of debts) {
      if (d.bal <= 0) continue;
      const interest = Math.round(d.bal * d.rate);
      d.bal += interest;
      interestTotal += interest;
    }
    const pays = new Map<string, number>();
    for (const d of debts) {
      if (d.bal <= 0) continue;
      const p = Math.min(d.min, d.bal, pool);
      d.bal -= p;
      pool -= p;
      pays.set(d.id, p);
    }
    const order = orderDebts(
      debts.filter((d) => d.bal > 0).map((d) => ({ ...d, balance: d.bal / 1000 })),
      strategy,
    ).sort((a, b) => Number(b.id === opts.focusId) - Number(a.id === opts.focusId));
    for (const o of order) {
      if (pool <= 0) break;
      const d = debts.find((x) => x.id === o.id)!;
      const p = Math.min(pool, d.bal);
      d.bal -= p;
      pool -= p;
      pays.set(d.id, (pays.get(d.id) ?? 0) + p);
    }
    for (const [id, p] of pays) {
      paidTotal += p;
      if (month === 1) firstMonthPlan.push({ id, name: debts.find((d) => d.id === id)!.name, payment: p / 1000 });
    }
    for (const d of debts) {
      if (d.bal <= 0 && !payoffOrder.some((p) => p.id === d.id)) payoffOrder.push({ id: d.id, name: d.name, month });
    }
    timeline.push({ month, total: debts.reduce((s, d) => s + Math.max(0, d.bal), 0) / 1000 });
    // Infeasible: balances growing with nothing left to allocate.
    if (month === 24 && timeline[24].total >= timeline[0].total) break;
  }
  const feasible = !debts.some((d) => d.bal > 0);
  return {
    strategy,
    feasible,
    months: feasible ? month : Infinity,
    totalInterest: interestTotal / 1000,
    totalPaid: paidTotal / 1000,
    payoffOrder,
    timeline,
    firstMonthPlan: firstMonthPlan.sort((a, b) => b.payment - a.payment),
  };
}

export function monthsToDate(today: ISODate, months: number): ISODate {
  return addMonthsClamped(today, months);
}

/** How much extra per month can realistically go to debt without touching essentials. */
export function recommendedDebtExtra(data: DataSet, today: ISODate): { amount: number; reason: string } {
  const plan = monthlyPlan(data);
  const sts = safeToSpend(data, today);
  if (!data.debts.some((d) => !d.closedAt && d.balance > 0)) return { amount: 0, reason: 'No open debts.' };
  if (plan.income <= 0) return { amount: 0, reason: 'Add your regular income first so the surplus can be calculated.' };
  if (sts.safe < 0) return { amount: 0, reason: 'Current commitments exceed available money. Stabilise this pay period before paying extra.' };
  if (plan.unallocated <= 0) return { amount: 0, reason: 'Your plan has no unallocated money. Reduce a budget to free up extra for debt.' };
  // Keep a quarter of the unallocated surplus flexible for irregular costs.
  const amount = Math.floor(plan.unallocated * 0.75);
  return { amount, reason: 'About 75% of your unallocated monthly surplus, keeping 25% flexible for irregular costs.' };
}

// ---------------------------------------------------------------- goals

export function goalProgress(g: Goal, today: ISODate) {
  const remaining = Math.max(0, sub(g.target, g.saved));
  const pct = g.target > 0 ? Math.min(1, g.saved / g.target) : 0;
  let monthsNeeded = g.monthlyContribution > 0 ? Math.ceil(remaining / g.monthlyContribution) : Infinity;
  if (remaining === 0) monthsNeeded = 0;
  let requiredMonthly: number | undefined;
  let onTrack = true;
  if (g.targetDate) {
    const monthsLeft = Math.max(1, Math.round(diffDays(today, g.targetDate) / 30.44));
    requiredMonthly = round(remaining / monthsLeft);
    onTrack = g.monthlyContribution >= requiredMonthly - 0.001;
  }
  const eta = Number.isFinite(monthsNeeded) ? addMonthsClamped(today, monthsNeeded) : undefined;
  return { remaining, pct, monthsNeeded, requiredMonthly, onTrack, eta };
}

export function debtProgress(d: Debt) {
  const paid = Math.max(0, sub(d.originalBalance, d.balance));
  return { paid, pct: d.originalBalance > 0 ? Math.min(1, paid / d.originalBalance) : 0 };
}

// ---------------------------------------------------------------- utilities

export const dateRangeLabel = (from: ISODate, to: ISODate) => `${from} → ${to}`;
export const isoMonthStart = monthStart;
export { toISO };

import { describe, expect, it } from 'vitest';
import { occurrences, addMonthsClamped } from '../src/lib/dates';
import {
  balances,
  budgetStatus,
  monthSummary,
  monthlyPlan,
  nextPayday,
  safeToSpend,
  simulateDebts,
  upcomingCommitments,
  cashflowProjection,
} from '../src/lib/finance';
import { sum, formatMoney, parseAmount } from '../src/lib/money';
import { scenario } from './fixtures';

const TODAY = '2026-11-16';

describe('money', () => {
  it('sums without floating point drift', () => {
    expect(sum([0.1, 0.2, 0.3])).toBe(0.6);
    expect(sum(Array(1000).fill(0.001))).toBe(1);
  });
  it('formats JOD readably', () => {
    expect(formatMoney(30, 'JOD')).toBe('30 JOD');
    expect(formatMoney(12.5, 'JOD')).toBe('12.50 JOD');
    expect(formatMoney(-3.125, 'JOD')).toBe('−3.125 JOD');
  });
  it('parses typed amounts', () => {
    expect(parseAmount('1,250.5 JOD')).toBe(1250.5);
    expect(Number.isNaN(parseAmount('abc'))).toBe(true);
  });
});

describe('dates', () => {
  it('clamps month ends', () => {
    expect(addMonthsClamped('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonthsClamped('2026-01-31', 2, 31)).toBe('2026-03-31');
  });
  it('generates monthly and weekly occurrences', () => {
    expect(occurrences('2026-01-31', 'monthly', '2026-02-01', '2026-04-30')).toEqual(['2026-02-28', '2026-03-31', '2026-04-30']);
    expect(occurrences('2026-11-02', 'weekly', '2026-11-10', '2026-11-30')).toEqual(['2026-11-16', '2026-11-23', '2026-11-30']);
    expect(occurrences('2026-12-01', 'once', '2026-11-01', '2026-12-31')).toEqual(['2026-12-01']);
  });
});

describe('balances', () => {
  it('applies transactions on/after opening date only', () => {
    const b = balances(scenario());
    // bank 400 - 60 - 40 - 20 = 280 ; cash 50 - 25.5 = 24.5 ; 999 dated before opening ignored
    expect(b.spendable).toBe(304.5);
    expect(b.savings).toBe(600);
  });
  it('handles transfers between accounts', () => {
    const d = scenario();
    d.transactions.push({ id: 'x', date: '2026-11-12', type: 'transfer', amount: 100, category: 'Transfer', accountId: 'bank', toAccountId: 'sav', createdAt: '', updatedAt: '' });
    const b = balances(d);
    expect(b.spendable).toBe(204.5);
    expect(b.savings).toBe(700);
  });
});

describe('payday and commitments', () => {
  it('finds next salary date', () => {
    const p = nextPayday(scenario(), TODAY);
    expect(p.date).toBe('2026-11-25');
    expect(p.daysLeft).toBe(9);
    expect(p.periodStart).toBe('2026-10-25');
  });
  it('lists unsettled bills and debt minimums, including overdue', () => {
    const list = upcomingCommitments(scenario(), TODAY, '2026-11-24');
    const names = list.map((o) => `${o.name}@${o.date}${o.overdue ? '!' : ''}`);
    expect(names).toEqual([
      'Electricity@2026-11-20',
      'Credit card (minimum)@2026-11-18',
      'Gym@2026-11-22',
    ].sort((a, b) => a.split('@')[1].localeCompare(b.split('@')[1])));
  });
  it('flags overdue bills', () => {
    const d = scenario();
    d.recurring.find((r) => r.id === 'elec')!.settledThrough = '2026-09-20';
    const list = upcomingCommitments(d, TODAY, '2026-11-24');
    expect(list.find((o) => o.date === '2026-10-20')?.overdue).toBe(true);
  });
});

describe('safe to spend', () => {
  it('subtracts commitments, savings reserve and buffer', () => {
    const s = safeToSpend(scenario(), TODAY);
    // available 304.5 - (35 elec + 50 card + 25 gym) - 50 savings reserve = 144.5
    expect(s.commitmentsTotal).toBe(110);
    expect(s.savingsReserve).toBe(50);
    expect(s.safe).toBe(144.5);
    expect(s.perDay).toBe(16.055); // 144.5 / 9 rounded down to fils
  });
  it('reports a shortfall', () => {
    const d = scenario();
    d.accounts[0].openingBalance = 100;
    const s = safeToSpend(d, TODAY);
    expect(s.safe).toBeLessThan(0);
    expect(s.status).toBe('shortfall');
  });
  it('bills due ON payday are not deducted (paid from salary)', () => {
    const d = scenario();
    d.recurring.push({ id: 'phone', name: 'Phone', kind: 'expense', amount: 15, category: 'Phone & internet', frequency: 'monthly', startDate: '2026-11-25', essential: true, active: true, createdAt: '' });
    expect(safeToSpend(d, TODAY).commitmentsTotal).toBe(110);
  });
});

describe('summaries and budgets', () => {
  it('summarises the month', () => {
    const s = monthSummary(scenario(), '2026-11');
    expect(s.spending).toBe(145.5);
    expect(s.discretionary).toBe(65.5); // eating out
    expect(s.byCategory[0]).toEqual({ category: 'Eating out', amount: 65.5 });
  });
  it('detects over-budget categories', () => {
    const b = budgetStatus(scenario(), TODAY);
    const eat = b.find((x) => x.category === 'Eating out')!;
    expect(eat.state).toBe('over');
    expect(eat.remaining).toBe(-15.5);
  });
  it('builds a monthly plan', () => {
    const p = monthlyPlan(scenario());
    expect(p.income).toBe(900);
    expect(p.essentialBills).toBe(335);
    expect(p.debtMinimums).toBe(170);
    expect(p.savings).toBe(50);
    expect(p.unallocated).toBe(900 - 335 - 25 - 170 - 50 - 200);
  });
});

describe('debt strategies', () => {
  const debts = scenario().debts;
  it('avalanche pays the highest interest first and costs less interest', () => {
    const a = simulateDebts(debts, 100, 'avalanche');
    const s = simulateDebts(debts, 100, 'snowball');
    expect(a.feasible).toBe(true);
    expect(a.payoffOrder[0].name).toBe('Credit card');
    expect(a.totalInterest).toBeLessThanOrEqual(s.totalInterest);
  });
  it('snowball pays the smallest balance first', () => {
    const d = [
      { ...debts[0], balance: 3000, apr: 30 },
      { ...debts[1], balance: 200, apr: 5 },
    ];
    expect(simulateDebts(d, 50, 'snowball').payoffOrder[0].name).toBe('Car loan');
    // avalanche: the 50 extra goes to the 30% card (min 50 + 50 extra = 100)
    expect(simulateDebts(d, 50, 'avalanche').firstMonthPlan.find((p) => p.name === 'Credit card')!.payment).toBe(100);
  });
  it('matches a hand-checked single-debt schedule', () => {
    // 1000 at 12% APR (1%/month), 100/month: standard amortisation = 11 months, ~58.98 interest
    const r = simulateDebts([{ ...debts[0], balance: 1000, apr: 12, minPayment: 100 }], 0, 'avalanche');
    expect(r.months).toBe(11);
    expect(r.totalInterest).toBeGreaterThan(58);
    expect(r.totalInterest).toBeLessThan(60);
  });
  it('detects debts that never get paid off', () => {
    const r = simulateDebts([{ ...debts[0], balance: 10000, apr: 36, minPayment: 100 }], 0, 'avalanche');
    expect(r.feasible).toBe(false);
  });
  it('extra payments shorten the timeline', () => {
    expect(simulateDebts(debts, 100, 'avalanche').months).toBeLessThan(simulateDebts(debts, 0, 'avalanche').months);
  });
});

describe('cash-flow projection', () => {
  it('includes salary and bills on their dates', () => {
    const pts = cashflowProjection(scenario(), TODAY, 12, 0);
    const salaryDay = pts.find((p) => p.date === '2026-11-25')!;
    expect(salaryDay.events.some((e) => e.name === 'Salary' && e.amount === 900)).toBe(true);
    // 304.5 - 35 - 50 - 25 + 900 - 120 (car loan 28th) = 974.5 by the 28th
    expect(pts.find((p) => p.date === '2026-11-28')!.balance).toBe(974.5);
  });
});

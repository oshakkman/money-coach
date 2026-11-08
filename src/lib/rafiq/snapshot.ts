// Builds the compact, pre-calculated financial summary sent to Claude ONLY when
// you explicitly ask for AI help. Free-text notes are never included.
import { addDays, monthKey, shiftMonth } from '../dates';
import {
  activeGoals,
  balances,
  budgetStatus,
  goalProgress,
  monthSummary,
  monthlyPlan,
  recommendedDebtExtra,
  safeToSpend,
  simulateDebts,
  upcomingCommitments,
} from '../finance';
import type { DataSet, ISODate } from '../types';

export function buildSnapshot(data: DataSet, today: ISODate) {
  const sts = safeToSpend(data, today);
  const b = balances(data);
  const plan = monthlyPlan(data);
  const openDebts = data.debts.filter((d) => !d.closedAt && d.balance > 0);
  const extra = recommendedDebtExtra(data, today);
  const aval = openDebts.length ? simulateDebts(openDebts, extra.amount, 'avalanche') : null;
  const snow = openDebts.length ? simulateDebts(openDebts, extra.amount, 'snowball') : null;
  const month = monthKey(today);
  const cur = monthSummary(data, month);
  const prev = monthSummary(data, shiftMonth(month, -1));
  return {
    today,
    currency: data.settings.currency,
    accounts: b.byAccount.map((x) => ({ name: x.account.name, type: x.account.type, balance: x.balance })),
    spendableBalance: b.spendable,
    savingsBalance: b.savings,
    payday: { date: sts.payday.date, daysLeft: sts.payday.daysLeft, source: sts.payday.source },
    safeToSpend: {
      safe: sts.safe,
      perDay: sts.perDay,
      perWeek: sts.perWeek,
      commitmentsBeforePayday: sts.commitmentsTotal,
      plannedSavingsReserve: sts.savingsReserve,
      buffer: sts.buffer,
      status: sts.status,
      recentDailyDiscretionarySpend: sts.recentDaily,
    },
    upcomingCommitments35Days: upcomingCommitments(data, today, addDays(today, 35)).map((o) => ({
      name: o.name,
      amount: o.amount,
      date: o.date,
      essential: o.essential,
      overdue: o.overdue,
    })),
    thisMonth: { income: cur.income, spending: cur.spending, essential: cur.essential, discretionary: cur.discretionary, saved: cur.saved, topCategories: cur.byCategory.slice(0, 6) },
    lastMonth: { income: prev.income, spending: prev.spending, discretionary: prev.discretionary, saved: prev.saved },
    budgets: budgetStatus(data, today).map((x) => ({ category: x.category, limit: x.limit, spent: x.spent, remaining: x.remaining, projected: x.projected, state: x.state })),
    monthlyPlan: {
      income: plan.income,
      essentialBills: plan.essentialBills,
      otherRegularCosts: plan.discretionaryBills,
      debtMinimums: plan.debtMinimums,
      savingsContributions: plan.savings,
      dayToDayBudgets: plan.variableBudgets,
      unallocated: plan.unallocated,
    },
    debts: openDebts.map((d) => ({ name: d.name, balance: d.balance, aprPercent: d.apr, minPayment: d.minPayment, dueDay: d.dueDay })),
    debtStrategy: aval && snow
      ? {
          recommendedExtraPerMonth: extra.amount,
          recommendedExtraReason: extra.reason,
          avalanche: { months: Number.isFinite(aval.months) ? aval.months : null, totalInterest: aval.totalInterest, order: aval.payoffOrder.map((p) => p.name) },
          snowball: { months: Number.isFinite(snow.months) ? snow.months : null, totalInterest: snow.totalInterest, order: snow.payoffOrder.map((p) => p.name) },
        }
      : null,
    goals: activeGoals(data.goals).map((g) => {
      const gp = goalProgress(g, today);
      return { name: g.name, target: g.target, saved: g.saved, monthlyContribution: g.monthlyContribution, targetDate: g.targetDate ?? null, requiredMonthly: gp.requiredMonthly ?? null, onTrack: gp.onTrack };
    }),
    openActions: data.actions.filter((a) => a.status === 'open').slice(0, 8).map((a) => ({ title: a.title, dueDate: a.dueDate })),
    recentTransactions: [...data.transactions]
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .slice(0, 25)
      .map((t) => ({ date: t.date, type: t.type, amount: t.amount, category: t.category })),
  };
}

export type Snapshot = ReturnType<typeof buildSnapshot>;

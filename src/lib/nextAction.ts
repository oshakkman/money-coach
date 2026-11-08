// Picks the single most important thing to do next, using fixed priority rules.
import { addDays, diffDays, formatDate, relativeDay } from './dates';
import { budgetStatus, goalProgress, recommendedDebtExtra, safeToSpend, activeGoals } from './finance';
import { formatMoney } from './money';
import type { DataSet, ISODate } from './types';

export type Route = 'dashboard' | 'transactions' | 'plan' | 'debts' | 'rafiq' | 'settings';

export interface NextAction {
  id: string;
  tone: 'critical' | 'warning' | 'good' | 'neutral';
  title: string;
  detail: string;
  cta?: { label: string; route?: Route; action?: 'pay-commitment' | 'backup' | 'add-transaction' | 'setup' | 'action-done'; ref?: string };
}

export const BACKUP_INTERVAL_DAYS = 7;

export function backupDue(data: DataSet, today: ISODate): boolean {
  const hasData = data.transactions.length + data.accounts.length + data.debts.length > 0;
  if (!hasData) return false;
  if (data.settings.backupReminderSnoozedUntil && data.settings.backupReminderSnoozedUntil > today) return false;
  if (!data.settings.lastBackupAt) return true;
  return diffDays(data.settings.lastBackupAt.slice(0, 10), today) >= BACKUP_INTERVAL_DAYS;
}

export function nextActions(data: DataSet, today: ISODate): NextAction[] {
  const c = data.settings.currency;
  const m = (n: number) => formatMoney(n, c);
  const out: NextAction[] = [];

  if (data.accounts.length === 0) {
    out.push({
      id: 'setup-balance',
      tone: 'neutral',
      title: 'Add your current balance',
      detail: 'Rafiq needs at least one account balance to tell you what you can safely spend.',
      cta: { label: 'Add balance', action: 'setup' },
    });
    return out;
  }

  const sts = safeToSpend(data, today);
  const overdue = sts.commitments.filter((o) => o.overdue);
  if (overdue.length) {
    const o = overdue[0];
    out.push({
      id: `overdue-${o.key}`,
      tone: 'critical',
      title: `Pay ${o.name} — overdue`,
      detail: `${m(o.amount)} was due ${relativeDay(o.date, today)}. If already paid, mark it paid so your numbers stay accurate.`,
      cta: { label: 'Mark as paid', action: 'pay-commitment', ref: o.key },
    });
  }

  if (sts.safe < 0) {
    out.push({
      id: 'shortfall',
      tone: 'critical',
      title: `Cover a ${m(-sts.safe)} shortfall before ${formatDate(sts.payday.date)}`,
      detail: `Your commitments before payday (${m(sts.commitmentsTotal)}${sts.savingsReserve ? ` + ${m(sts.savingsReserve)} planned savings` : ''}) exceed your available ${m(sts.available)}. Ask Rafiq for a recovery plan.`,
      cta: { label: 'Make a plan', route: 'rafiq' },
    });
  }

  const soon = sts.commitments.filter((o) => !o.overdue && diffDays(today, o.date) <= 3);
  if (soon.length) {
    const o = soon[0];
    out.push({
      id: `soon-${o.key}`,
      tone: 'warning',
      title: `${o.name} due ${relativeDay(o.date, today)}`,
      detail: `Keep ${m(o.amount)} available. Mark it paid once done.`,
      cta: { label: 'Mark as paid', action: 'pay-commitment', ref: o.key },
    });
  }

  const overdueActions = data.actions.filter((a) => a.status === 'open' && a.dueDate <= today);
  if (overdueActions.length) {
    const a = overdueActions[0];
    out.push({
      id: `action-${a.id}`,
      tone: 'warning',
      title: `Follow-up: ${a.title}`,
      detail: `You agreed to this ${a.dueDate < today ? 'by ' + formatDate(a.dueDate) : 'for today'}. Did you do it?`,
      cta: { label: 'Mark done', action: 'action-done', ref: a.id },
    });
  }

  if (backupDue(data, today)) {
    out.push({
      id: 'backup',
      tone: 'warning',
      title: data.settings.lastBackupAt ? 'Back up your data — last backup over a week ago' : 'Create your first backup',
      detail: 'Your records live only on this device. An encrypted backup protects them if the device is lost or browser data is cleared.',
      cta: { label: 'Back up now', action: 'backup' },
    });
  }

  const over = budgetStatus(data, today).filter((b) => b.state === 'over');
  if (over.length) {
    const b = over[0];
    out.push({
      id: `budget-${b.category}`,
      tone: 'warning',
      title: `Stop spending on ${b.category} this month`,
      detail: `You've spent ${m(b.spent)} of a ${m(b.limit)} limit (${m(-b.remaining)} over).`,
      cta: { label: 'Review plan', route: 'plan' },
    });
  }

  if (sts.status === 'tight' && sts.safe >= 0) {
    out.push({
      id: 'tight',
      tone: 'warning',
      title: `Keep spending under ${m(sts.perDay)} a day`,
      detail: `You've recently averaged ${m(sts.recentDaily)} a day. ${sts.payday.daysLeft} days to payday.`,
      cta: { label: 'Ask Rafiq', route: 'rafiq' },
    });
  }

  const extra = recommendedDebtExtra(data, today);
  if (extra.amount > 0) {
    out.push({
      id: 'debt-extra',
      tone: 'good',
      title: `Put an extra ${m(extra.amount)} towards debt this month`,
      detail: extra.reason,
      cta: { label: 'See strategy', route: 'debts' },
    });
  }

  const behind = activeGoals(data.goals).find((g) => !goalProgress(g, today).onTrack);
  if (behind) {
    const gp = goalProgress(behind, today);
    out.push({
      id: `goal-${behind.id}`,
      tone: 'neutral',
      title: `${behind.name} is behind schedule`,
      detail: `You need ${m(gp.requiredMonthly ?? 0)}/month to reach it by ${formatDate(behind.targetDate!)}, but plan ${m(behind.monthlyContribution)}.`,
      cta: { label: 'Adjust goal', route: 'plan' },
    });
  }

  const lastTx = data.transactions.reduce<string | null>((mx, t) => (!mx || t.date > mx ? t.date : mx), null);
  if (!lastTx || lastTx < addDays(today, -2)) {
    out.push({
      id: 'log',
      tone: 'neutral',
      title: 'Log your recent spending',
      detail: 'Rafiq is only as accurate as your records. It takes 30 seconds.',
      cta: { label: 'Add transaction', action: 'add-transaction' },
    });
  }

  if (!out.length) {
    out.push({
      id: 'on-track',
      tone: 'good',
      title: 'You are on track',
      detail: `Safe to spend: ${m(sts.safe)} until ${formatDate(sts.payday.date)}. Keep logging spending as it happens.`,
      cta: { label: 'Add transaction', action: 'add-transaction' },
    });
  }
  return out;
}

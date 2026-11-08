// Rafiq offline accountability engine: rules-based, uses only your recorded
// data, and always answers in the same six-part structure.
import { addDays, addMonthsClamped, diffDays, formatDate, monthKey, monthStart, parseISO, daysInMonth, shiftMonth } from '../dates';
import {
  activeGoals,
  averageDailyVariableSpend,
  balances,
  budgetStatus,
  goalProgress,
  isDiscretionarySpend,
  monthSummary,
  monthlyPlan,
  orderDebts,
  recommendedDebtExtra,
  safeToSpend,
  simulateDebts,
  upcomingCommitments,
} from '../finance';
import { formatMoney, round, sum } from '../money';
import type { DataSet, ISODate, RafiqResponse, RafiqStep } from '../types';
import { parseMessage, type Parsed } from './parse';

export interface EngineResult {
  parsed: Parsed;
  response: RafiqResponse;
}

function nextDueDate(today: ISODate, dueDay: number): ISODate {
  const d = addMonthsClamped(monthStart(today), 0, dueDay);
  return d >= today ? d : addMonthsClamped(monthStart(today), 1, dueDay);
}

const months = (n: number) => (n === 1 ? '1 month' : `${n} months`);

/** Top discretionary categories over the last 30 days - where cuts are realistic. */
function topDiscretionary(data: DataSet, today: ISODate, n = 3) {
  const from = addDays(today, -30);
  const map = new Map<string, number>();
  for (const t of data.transactions) {
    if (t.date < from || t.date > today || !isDiscretionarySpend(t, data)) continue;
    map.set(t.category, round((map.get(t.category) ?? 0) + t.amount));
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

function noDataResponse(): RafiqResponse {
  return {
    verdict: 'info',
    headline: 'I need your starting numbers first',
    situation: 'You have not recorded any account balance yet, so I cannot see your real position.',
    constraints: ['Every recommendation I make is based on your recorded balances, bills, debts and income.'],
    recommendation: 'Add your current balance and your income so I can work from facts instead of guesses.',
    steps: [
      { title: 'Add your current balance', detail: 'Dashboard → Set up → Balances. Cash and bank accounts.' },
      { title: 'Add your income and payday', detail: 'Plan → Income.' },
      { title: 'Add rent and other regular bills', detail: 'Plan → Bills & commitments.' },
    ],
    impact: ['Takes about 3 minutes. After that, every answer uses your actual figures.'],
    followUp: { question: 'Have you added your balance and income?', inDays: 1 },
  };
}

export function runEngine(message: string, data: DataSet, today: ISODate): EngineResult {
  const parsed = parseMessage(message, data);
  if (!data.accounts.length) return { parsed, response: noDataResponse() };
  const handlers = { salary, debt, unexpected, overspent, afford, lowcash, savings, status };
  return { parsed, response: handlers[parsed.intent](parsed, data, today) };
}

// ------------------------------------------------------------ affordability

function afford(p: Parsed, data: DataSet, today: ISODate): RafiqResponse {
  const c = data.settings.currency;
  const m = (n: number) => formatMoney(n, c);
  const sts = safeToSpend(data, today);
  const days = Math.max(1, sts.payday.daysLeft);
  if (p.amount === undefined) {
    return {
      verdict: 'info',
      headline: 'How much does it cost?',
      situation: `You can safely spend ${m(Math.max(0, sts.safe))} until ${formatDate(sts.payday.date)} (${days} days).`,
      constraints: [`${m(sts.commitmentsTotal)} is already committed to bills before payday.`],
      recommendation: 'Tell me the price and I will check it against your actual position.',
      steps: [{ title: 'Reply with the price', detail: 'For example: "It costs 50".' }],
      impact: [],
      followUp: { question: 'Did you decide on the purchase?', inDays: 2 },
      questions: ['What is the price?'],
    };
  }
  const x = p.amount;
  const after = round(sts.safe - x);
  const afterPerDay = after > 0 ? round(after / days) : 0;
  const overdue = sts.commitments.filter((o) => o.overdue);
  const topDebt = orderDebts(data.debts.filter((d) => !d.closedAt && d.balance > 0), 'avalanche')[0];
  const constraints: string[] = [
    `Available now: ${m(sts.available)}. Committed before payday: ${m(sts.commitmentsTotal)}${sts.savingsReserve ? `; planned savings: ${m(sts.savingsReserve)}` : ''}.`,
    `Payday: ${formatDate(sts.payday.date)} (${days} days away).`,
  ];
  if (overdue.length) constraints.push(`Overdue: ${overdue.map((o) => `${o.name} ${m(o.amount)}`).join(', ')}.`);
  if (sts.recentDaily > 0) constraints.push(`You have recently spent about ${m(sts.recentDaily)} a day on day-to-day items.`);
  const steps: RafiqStep[] = [];
  const impact: string[] = [];
  let verdict: RafiqResponse['verdict'];
  let headline: string;
  let recommendation: string;

  if (overdue.length && !p.essentialHint) {
    verdict = 'no';
    headline = 'Not before your overdue bills are paid';
    recommendation = `Pay ${overdue[0].name} first. Spending ${m(x)} on something optional while a bill is overdue risks late fees and stress.`;
    steps.push({ title: `Pay ${overdue[0].name}`, amount: overdue[0].amount }, { title: 'Re-ask me once overdue bills are cleared' });
    impact.push(`Remaining safe-to-spend after the bill stays at ${m(sts.safe)} (the bill is already counted).`);
  } else if (after < 0) {
    verdict = 'no';
    headline = `No — it would leave you ${m(-after)} short`;
    const plan = monthlyPlan(data);
    const perMonth = Math.max(0, plan.unallocated);
    recommendation = p.essentialHint
      ? `This sounds necessary. Fund it by reducing optional spending and pausing savings this period rather than borrowing.`
      : `Wait. Buying it now means a bill or essential would go unpaid before ${formatDate(sts.payday.date)}.`;
    if (p.essentialHint && sts.savingsReserve > 0) steps.push({ title: 'Pause this period’s savings contribution', amount: sts.savingsReserve });
    if (!p.essentialHint) {
      steps.push({ title: 'Do not buy it this pay period' });
      if (perMonth > 0) {
        const n = Math.ceil(x / (perMonth * 0.5));
        steps.push({ title: `Set aside ${m(round(Math.min(x, perMonth * 0.5)))} per month for it`, detail: `You could buy it in about ${months(n)} without touching essentials.` });
      } else {
        steps.push({ title: 'Free up room in your plan first', detail: 'Your monthly plan has no unallocated money for extras.' });
      }
      steps.push({ title: `Revisit on payday (${formatDate(sts.payday.date)})` });
    } else {
      const cuts = topDiscretionary(data, today);
      if (cuts.length) steps.push({ title: `Freeze ${cuts.map((c2) => c2[0]).join(', ')} until payday` });
      steps.push({ title: 'Ask the seller about instalments with zero interest, if available' });
    }
    impact.push(`Buying now: safe-to-spend goes from ${m(sts.safe)} to ${m(after)}.`);
    if (topDebt && topDebt.apr > 0) impact.push(`Waiting also avoids adding pressure while ${topDebt.name} charges ${topDebt.apr}% interest.`);
  } else if (sts.recentDaily > 0 && afterPerDay < sts.recentDaily) {
    verdict = 'caution';
    headline = 'Technically yes, but it squeezes the rest of the month';
    recommendation = `You can cover it, but your daily allowance would drop to ${m(afterPerDay)} — below the ${m(sts.recentDaily)} you usually spend. Only buy it if you will cut elsewhere.`;
    steps.push(
      { title: 'Decide what you will cut to make room', detail: topDiscretionary(data, today).map((c2) => c2[0]).join(', ') || undefined },
      { title: `If you buy it, keep daily spending under ${m(afterPerDay)}` },
      { title: 'Record the purchase in Rafiq straight away', amount: x },
    );
    impact.push(`Safe-to-spend: ${m(sts.safe)} → ${m(after)}.`, `Daily allowance: ${m(sts.perDay)} → ${m(afterPerDay)}.`);
  } else if (x > sts.safe * 0.5) {
    verdict = 'caution';
    headline = 'Yes, but it uses most of your spare money';
    recommendation = `It fits, but takes ${Math.round((x / Math.max(sts.safe, 0.001)) * 100)}% of what you can safely spend until payday. Make sure it is worth that.`;
    steps.push({ title: 'Wait 24 hours before buying', detail: 'If you still want it tomorrow, go ahead.' }, { title: 'Record it once bought', amount: x }, { title: `Then keep daily spending under ${m(afterPerDay)}` });
    impact.push(`Safe-to-spend: ${m(sts.safe)} → ${m(after)}.`, `Daily allowance: ${m(sts.perDay)} → ${m(afterPerDay)}.`);
  } else {
    verdict = 'yes';
    headline = 'Yes, you can afford it';
    recommendation = `It fits within your safe-to-spend without touching bills, debt payments or savings.`;
    steps.push({ title: 'Buy it and record it in Rafiq', amount: x }, { title: `Keep daily spending under ${m(afterPerDay)} until payday` });
    impact.push(`Safe-to-spend: ${m(sts.safe)} → ${m(after)}.`, `Daily allowance: ${m(sts.perDay)} → ${m(afterPerDay)}.`);
  }
  return {
    verdict,
    headline,
    situation: `You asked about spending ${m(x)}. You can safely spend ${m(sts.safe)} until ${formatDate(sts.payday.date)}.`,
    constraints,
    recommendation,
    steps,
    impact,
    followUp: { question: verdict === 'yes' ? `Did you record the ${m(x)} purchase and stay within ${m(afterPerDay)} a day?` : 'Did you hold off on the purchase?', inDays: Math.min(7, days) },
  };
}

// ------------------------------------------------------------ low cash until payday

function lowcash(p: Parsed, data: DataSet, today: ISODate): RafiqResponse {
  const c = data.settings.currency;
  const m = (n: number) => formatMoney(n, c);
  const sts = safeToSpend(data, today);
  const recorded = sts.available;
  const stated = p.amount;
  const days = Math.max(1, p.days ?? sts.payday.daysLeft);
  const cash = stated ?? recorded;
  const constraints: string[] = [];
  if (stated !== undefined && Math.abs(stated - recorded) > Math.max(1, recorded * 0.02)) {
    constraints.push(`Your records show ${m(recorded)} available, but you said ${m(stated)}. I am using ${m(stated)}. Update your balances so future answers are accurate.`);
  }
  if (p.days !== undefined && Math.abs(p.days - sts.payday.daysLeft) > 1 && sts.payday.source === 'income') {
    constraints.push(`Your recorded payday is ${formatDate(sts.payday.date)} (${sts.payday.daysLeft} days). I am using your ${days} days.`);
  }
  const until = addDays(today, days - 1);
  const due = upcomingCommitments(data, today, until);
  const dueTotal = sum(due.map((o) => o.amount));
  const essentialDue = due.filter((o) => o.essential);
  const optionalDue = due.filter((o) => !o.essential);
  if (due.length) constraints.push(`Due before payday: ${due.map((o) => `${o.name} ${m(o.amount)} (${formatDate(o.date)})`).join('; ')}.`);
  else constraints.push('No recorded bills are due before payday.');
  const free = round(cash - dueTotal);
  const steps: RafiqStep[] = [];
  const impact: string[] = [];
  const cuts = topDiscretionary(data, today);
  let verdict: RafiqResponse['verdict'];
  let headline: string;
  let recommendation: string;
  if (free < 0) {
    verdict = 'no';
    const essentialTotal = sum(essentialDue.map((o) => o.amount));
    headline = `You are ${m(-free)} short before payday`;
    recommendation =
      essentialTotal <= cash
        ? `Cover essentials first (${m(essentialTotal)}), then postpone optional bills and spend only on food and transport.`
        : `Even essential bills (${m(essentialTotal)}) exceed your ${m(cash)}. Contact the providers now to move due dates — before they become late.`;
    for (const o of essentialDue.slice(0, 4)) steps.push({ title: `Keep money for ${o.name}`, amount: o.amount, detail: `Due ${formatDate(o.date)}` });
    for (const o of optionalDue.slice(0, 3)) steps.push({ title: `Postpone or cancel ${o.name}`, amount: o.amount });
    if (sts.savingsReserve > 0) steps.push({ title: 'Pause savings contributions until payday', amount: sts.savingsReserve });
    if (essentialTotal > cash) steps.push({ title: 'Call the provider of the largest bill and ask for a new due date' });
    steps.push({ title: 'Do not use a credit card or new loan to fill the gap unless a bill would otherwise go unpaid' });
    impact.push(`Paying essentials only leaves ${m(round(cash - essentialTotal))} for ${days} days.`);
  } else {
    const perDay = round(Math.floor((free / days) * 1000) / 1000);
    const tight = sts.recentDaily > 0 && perDay < sts.recentDaily;
    verdict = tight ? 'caution' : 'yes';
    headline = `You can spend ${m(perDay)} a day for ${days} days`;
    recommendation = tight
      ? `That is below the ${m(sts.recentDaily)} a day you usually spend, so you need to cut back now — not in a week.`
      : `That covers your bills. Stick to the daily limit and you will reach payday safely.`;
    for (const o of due.slice(0, 3)) steps.push({ title: `Set aside ${m(o.amount)} for ${o.name}`, detail: `Due ${formatDate(o.date)}` });
    steps.push({ title: `Daily limit: ${m(perDay)}`, detail: 'Groceries, transport and essentials first.' });
    if (cuts.length && tight) steps.push({ title: `Pause ${cuts.map((x) => x[0]).join(', ')} until payday`, detail: `Last 30 days: ${cuts.map((x) => `${x[0]} ${m(x[1])}`).join(', ')}` });
    steps.push({ title: 'Log every purchase the same day' });
    impact.push(`Bills covered: ${m(dueTotal)}. Free for daily spending: ${m(free)}.`);
    if (tight) impact.push(`Cutting to ${m(perDay)}/day instead of ${m(sts.recentDaily)}/day keeps ${m(round((sts.recentDaily - perDay) * days))} from running out.`);
  }
  return {
    verdict,
    headline,
    situation: `You have ${m(cash)} and ${days} days until payday.`,
    constraints,
    recommendation,
    steps,
    impact,
    followUp: { question: free < 0 ? 'Did you contact providers and protect the essential bills?' : `Did you stay under ${m(Math.max(0, round(free / days)))} a day?`, inDays: Math.min(3, days) },
  };
}

// ------------------------------------------------------------ overspent

function overspent(_p: Parsed, data: DataSet, today: ISODate): RafiqResponse {
  const c = data.settings.currency;
  const m = (n: number) => formatMoney(n, c);
  const month = monthKey(today);
  const cur = monthSummary(data, month);
  const prev = monthSummary(data, shiftMonth(month, -1));
  const budgets = budgetStatus(data, today);
  const over = budgets.filter((b) => b.state === 'over');
  const sts = safeToSpend(data, today);
  const d = parseISO(today);
  const daysLeftInMonth = daysInMonth(d.getFullYear(), d.getMonth()) - d.getDate() + 1;
  const overBy = sum(over.map((b) => -b.remaining));
  const constraints: string[] = [
    `This month: ${m(cur.discretionary)} on optional spending${prev.discretionary ? ` vs ${m(prev.discretionary)} last month` : ''}.`,
    `Safe to spend until ${formatDate(sts.payday.date)}: ${m(sts.safe)}.`,
  ];
  if (over.length) constraints.push(`Over budget: ${over.map((b) => `${b.category} by ${m(-b.remaining)}`).join(', ')}.`);
  if (!budgets.length) constraints.push('You have no category budgets yet, so I compared against last month.');
  const steps: RafiqStep[] = [];
  for (const b of over) steps.push({ title: `Freeze ${b.category} for the rest of the month`, detail: `${m(b.spent)} spent of ${m(b.limit)}` });
  const cuts = topDiscretionary(data, today).filter((x) => !over.some((b) => b.category === x[0]));
  if (cuts.length) steps.push({ title: `Halve ${cuts[0][0]} until payday`, detail: `${m(cuts[0][1])} in the last 30 days` });
  const subs = data.recurring.filter((r) => r.active && r.kind === 'expense' && !r.essential);
  if (subs.length) steps.push({ title: `Cancel or pause one optional regular cost`, detail: subs.map((s) => `${s.name} ${m(s.amount)}`).join(', ') });
  if (sts.safe < 0 && sts.savingsReserve > 0) steps.push({ title: 'Reduce this period’s savings to cover the gap', amount: Math.min(sts.savingsReserve, -sts.safe) });
  const perDay = sts.safe > 0 ? round(sts.safe / Math.max(1, sts.payday.daysLeft)) : 0;
  steps.push({ title: `New daily cap: ${m(perDay)} until payday` });
  return {
    verdict: sts.safe < 0 ? 'no' : 'caution',
    headline: sts.safe < 0 ? 'Recovery needed: commitments are now at risk' : 'Recoverable — if you tighten now',
    situation: over.length
      ? `You are ${m(overBy)} over budget across ${over.length} ${over.length === 1 ? 'category' : 'categories'}, with ${daysLeftInMonth} days left this month.`
      : `Optional spending this month is ${m(cur.discretionary)}, with ${daysLeftInMonth} days left.`,
    constraints,
    recommendation:
      sts.safe < 0
        ? `Stop all optional spending until ${formatDate(sts.payday.date)} and protect bills first. You are ${m(-sts.safe)} short.`
        : `Freeze the categories that went over, cap daily spending at ${m(perDay)}, and set realistic budgets for next month.`,
    steps,
    impact: [
      sts.safe < 0 ? `Closing the ${m(-sts.safe)} gap protects your bills.` : `Holding to ${m(perDay)}/day gets you to payday with your bills covered.`,
      over.length ? `Next month: either raise the ${over[0].category} budget honestly or cut it at the source.` : 'Set budgets in Plan so I can warn you earlier next time.',
    ],
    followUp: { question: `Did you keep spending under ${m(perDay)} a day this week?`, inDays: 7 },
  };
}

// ------------------------------------------------------------ salary received

function salary(p: Parsed, data: DataSet, today: ISODate): RafiqResponse {
  const c = data.settings.currency;
  const m = (n: number) => formatMoney(n, c);
  const salaryItem = data.recurring.find((r) => r.kind === 'income' && r.active && r.category === 'Salary') ?? data.recurring.find((r) => r.kind === 'income' && r.active);
  const recordedRecently = data.transactions.some((t) => t.type === 'income' && t.date >= addDays(today, -3));
  const amount = p.amount ?? salaryItem?.amount;
  if (amount === undefined) {
    return {
      verdict: 'info',
      headline: 'How much did you receive?',
      situation: 'You have no regular income recorded, so I do not know your salary amount.',
      constraints: [],
      recommendation: 'Tell me the amount, and add your salary under Plan → Income so I know your payday next time.',
      steps: [{ title: 'Reply with the amount received' }],
      impact: [],
      followUp: { question: 'Did you record your salary?', inDays: 1 },
      questions: ['How much did you receive?'],
    };
  }
  const { spendable } = balances(data);
  const cash = recordedRecently ? spendable : round(spendable + amount);
  const nextPay = addMonthsClamped(today, 1);
  const due = upcomingCommitments(data, today, addDays(nextPay, -1));
  const essential = due.filter((o) => o.essential);
  const optional = due.filter((o) => !o.essential);
  const essentialTotal = sum(essential.map((o) => o.amount));
  const optionalTotal = sum(optional.map((o) => o.amount));
  const goals = activeGoals(data.goals);
  const savingsTotal = sum(goals.map((g) => Math.min(g.monthlyContribution, g.target - g.saved)));
  let remaining = round(cash - essentialTotal - optionalTotal);
  const steps: RafiqStep[] = [];
  if (!recordedRecently) steps.push({ title: `Record the ${m(amount)} income in Rafiq`, detail: salaryItem ? `Mark "${salaryItem.name}" as received on the dashboard.` : undefined });
  const overdue = due.filter((o) => o.overdue);
  for (const o of overdue) steps.push({ title: `Pay overdue ${o.name} today`, amount: o.amount });
  if (essentialTotal) steps.push({ title: 'Set aside essential bills for this month', amount: essentialTotal, detail: essential.filter((o) => !o.overdue).map((o) => `${o.name} ${m(o.amount)} (${formatDate(o.date)})`).join(', ') });
  if (optionalTotal) steps.push({ title: 'Set aside other regular costs', amount: optionalTotal, detail: optional.map((o) => o.name).join(', ') });
  let savingsNow = 0;
  if (remaining > 0 && savingsTotal > 0) {
    savingsNow = Math.min(savingsTotal, remaining);
    steps.push({ title: 'Move savings now, before spending starts', amount: savingsNow, detail: goals.map((g) => `${g.name} ${m(g.monthlyContribution)}`).join(', ') });
    remaining = round(remaining - savingsNow);
  }
  const extra = recommendedDebtExtra({ ...data }, today).amount;
  let extraNow = 0;
  if (remaining > 0 && extra > 0) {
    extraNow = Math.min(extra, Math.floor(remaining * 0.5));
    const target = orderDebts(data.debts.filter((d) => !d.closedAt && d.balance > 0), 'avalanche')[0];
    if (extraNow > 0 && target) {
      steps.push({ title: `Pay an extra ${m(extraNow)} to ${target.name}`, detail: `Highest interest (${target.apr}%).`, amount: extraNow });
      remaining = round(remaining - extraNow);
    }
  }
  const weekly = remaining > 0 ? round(remaining / (52 / 12)) : 0;
  steps.push({ title: `Weekly spending limit: ${m(weekly)}`, detail: 'Everything left after bills, savings and debt.' });
  return {
    verdict: remaining < 0 ? 'caution' : 'yes',
    headline: remaining < 0 ? 'Your salary does not cover this month’s commitments' : 'Pay yourself in this order',
    situation: `You received ${m(amount)}. Money available including it: ${m(cash)}.`,
    constraints: [
      `Commitments before your next payday (~${formatDate(nextPay)}): ${m(round(essentialTotal + optionalTotal))}${overdue.length ? `, including ${overdue.length} overdue` : ''}.`,
      savingsTotal ? `Planned savings: ${m(savingsTotal)}.` : 'No savings goals set yet.',
    ],
    recommendation:
      remaining < 0
        ? `Pay essentials first. You are ${m(-remaining)} short on the full list, so postpone optional costs and skip extra debt payments this month.`
        : 'Allocate it today: bills first, savings second, extra debt third, then live on the weekly limit.',
    steps,
    impact: [
      `After commitments${savingsNow ? ', savings' : ''}${extraNow ? ' and extra debt' : ''}: ${m(Math.max(0, remaining))} to live on (${m(weekly)} per week).`,
      ...(extraNow ? [`The extra ${m(extraNow)} reduces interest and brings your debt-free date closer.`] : []),
    ],
    followUp: { question: 'Did you move savings and set aside bill money on payday?', inDays: 2 },
  };
}

// ------------------------------------------------------------ unexpected expense

function unexpected(p: Parsed, data: DataSet, today: ISODate): RafiqResponse {
  const c = data.settings.currency;
  const m = (n: number) => formatMoney(n, c);
  const sts = safeToSpend(data, today);
  if (p.amount === undefined) {
    return {
      verdict: 'info',
      headline: 'How much is the expense, and when must it be paid?',
      situation: `You can safely spend ${m(sts.safe)} until ${formatDate(sts.payday.date)}.`,
      constraints: [],
      recommendation: 'Give me the amount and I will rework your plan.',
      steps: [{ title: 'Reply with the amount' }],
      impact: [],
      followUp: { question: 'Did you sort out the unexpected expense?', inDays: 2 },
      questions: ['How much is it?', 'Does it have to be paid before payday?'],
    };
  }
  const x = p.amount;
  const { savings } = balances(data);
  const steps: RafiqStep[] = [];
  let gap = round(x - Math.max(0, sts.safe));
  const sources: string[] = [];
  if (sts.safe > 0) sources.push(`${m(Math.min(x, sts.safe))} from safe-to-spend`);
  if (gap > 0 && sts.savingsReserve > 0) {
    const use = Math.min(gap, sts.savingsReserve);
    steps.push({ title: 'Skip this period’s planned savings', amount: use });
    sources.push(`${m(use)} by pausing planned savings`);
    gap = round(gap - use);
  }
  const optional = sts.commitments.filter((o) => !o.essential && !o.overdue);
  if (gap > 0 && optional.length) {
    const use = Math.min(gap, sum(optional.map((o) => o.amount)));
    steps.push({ title: `Postpone ${optional.map((o) => o.name).join(', ')}`, amount: use });
    sources.push(`${m(use)} by postponing optional costs`);
    gap = round(gap - use);
  }
  if (gap > 0 && savings > 0) {
    const use = Math.min(gap, savings);
    steps.push({ title: 'Use savings — this is what they are for', amount: use, detail: 'Then rebuild them from your next salary.' });
    sources.push(`${m(use)} from savings`);
    gap = round(gap - use);
  }
  if (gap > 0) {
    steps.push({ title: 'Ask to pay in instalments or delay the due date', detail: `You still need ${m(gap)}.` });
    steps.push({ title: 'Avoid payday loans and cash advances', detail: 'If you must borrow, use the lowest-interest option and set a repayment date.' });
  }
  steps.unshift({ title: 'Record the expense in Rafiq once paid', amount: x });
  const newSafe = round(sts.safe - x + (sts.savingsReserve > 0 ? Math.min(sts.savingsReserve, Math.max(0, x - Math.max(0, sts.safe))) : 0));
  const perDay = newSafe > 0 ? round(newSafe / Math.max(1, sts.payday.daysLeft)) : 0;
  steps.push({ title: `New daily limit until payday: ${m(perDay)}` });
  return {
    verdict: gap > 0 ? 'no' : sts.safe >= x ? 'yes' : 'caution',
    headline: gap > 0 ? `You can cover ${m(x - gap)} of it — ${m(gap)} needs a plan` : 'You can absorb it — here is how',
    situation: `An unexpected ${m(x)} expense. You had ${m(sts.safe)} safe to spend until ${formatDate(sts.payday.date)}.`,
    constraints: [
      `Bills before payday stay protected: ${m(sts.commitmentsTotal)}.`,
      savings > 0 ? `Savings accounts: ${m(savings)}.` : 'No savings balance recorded.',
    ],
    recommendation: `Fund it in this order: ${sources.join(', ') || 'none of your current sources cover it'}. Do not touch essential bills.`,
    steps,
    impact: [`Daily allowance changes from ${m(sts.perDay)} to ${m(perDay)}.`, ...(gap > 0 ? [`Unfunded gap: ${m(gap)}.`] : [])],
    followUp: { question: 'Did you pay the expense and adjust your spending?', inDays: 3 },
  };
}

// ------------------------------------------------------------ debt

function debt(p: Parsed, data: DataSet, today: ISODate): RafiqResponse {
  const c = data.settings.currency;
  const m = (n: number) => formatMoney(n, c);
  const open = data.debts.filter((d) => !d.closedAt && d.balance > 0);
  if (!open.length) {
    return {
      verdict: 'info',
      headline: 'No debts recorded',
      situation: 'You have not recorded any open debts.',
      constraints: [],
      recommendation: 'Add each debt (balance, interest rate, minimum payment, due day) under Debts and I will build a payoff plan.',
      steps: [{ title: 'Add your debts', detail: 'Debts → Add debt' }],
      impact: [],
      followUp: { question: 'Have you added your debts?', inDays: 2 },
    };
  }
  const rec = recommendedDebtExtra(data, today);
  const extra = p.amount ?? rec.amount;
  const base = simulateDebts(open, 0, 'avalanche');
  const target = p.debtId ? open.find((d) => d.id === p.debtId)! : orderDebts(open, 'avalanche')[0];
  const focus = simulateDebts(open, extra, 'avalanche', { focusId: target.id });
  const aval = simulateDebts(open, extra, 'avalanche');
  const snow = simulateDebts(open, extra, 'snowball');
  const targetMonthBase = base.payoffOrder.find((x) => x.id === target.id)?.month;
  const targetMonthFocus = focus.payoffOrder.find((x) => x.id === target.id)?.month;
  const constraints = [
    `Minimum payments total ${m(sum(open.map((d) => d.minPayment)))} a month.`,
    `${rec.amount > 0 ? `Realistic extra per month: ${m(rec.amount)}.` : rec.reason}`,
  ];
  const highest = orderDebts(open, 'avalanche')[0];
  if (p.debtId && target.id !== highest.id && highest.apr > target.apr) {
    constraints.push(`${highest.name} charges more interest (${highest.apr}% vs ${target.apr}%). Paying it first saves ${m(Math.max(0, round(focus.totalInterest - aval.totalInterest)))} more interest.`);
  }
  if (extra <= 0) {
    const cut = topDiscretionary(data, today, 2);
    return {
      verdict: 'caution',
      headline: 'No room for extra payments yet',
      situation: `You owe ${m(sum(open.map((d) => d.balance)))} across ${open.length} debts.`,
      constraints,
      recommendation: 'Free up a fixed monthly amount first. Even a small, consistent extra payment makes a real difference.',
      steps: [
        ...(cut.length ? [{ title: `Cut ${cut[0][0]} by a quarter`, detail: `Frees about ${m(round(cut[0][1] * 0.25))} per month.` }] : []),
        { title: 'Keep paying every minimum on time' },
        { title: 'Ask me again with an amount, e.g. "pay off my loan faster with 40 extra"' },
      ],
      impact: base.feasible ? [`At minimums only: debt-free in ${months(base.months)}, paying ${m(base.totalInterest)} interest.`] : ['At minimums only, some debts never get paid off — interest is larger than the payment.'],
      followUp: { question: 'Did you find an amount to put towards debt?', inDays: 7 },
    };
  }
  const saved = base.feasible ? round(base.totalInterest - focus.totalInterest) : undefined;
  return {
    verdict: 'yes',
    headline: `Put ${m(extra)} extra on ${target.name} each month`,
    situation: `${target.name}: ${m(target.balance)} at ${target.apr}% with a ${m(target.minPayment)} minimum.`,
    constraints,
    recommendation: `Pay minimums on everything and send the extra ${m(extra)} to ${target.name}. When it is cleared, roll its payment into the next debt.`,
    steps: [
      { title: `Pay ${m(round(target.minPayment + extra))} to ${target.name} on day ${target.dueDay}`, amount: round(target.minPayment + extra) },
      { title: 'Keep minimums on all other debts', amount: sum(open.filter((d) => d.id !== target.id).map((d) => d.minPayment)) || undefined },
      { title: 'Record each payment in Debts so balances stay accurate' },
    ],
    impact: [
      targetMonthFocus ? `${target.name} cleared in ${months(targetMonthFocus)}${targetMonthBase ? ` instead of ${months(targetMonthBase)}` : ''}.` : `${target.name} still not cleared within 50 years — increase the payment.`,
      focus.feasible ? `All debts cleared by ${formatDate(addMonthsClamped(today, focus.months))}.` : 'Some debts remain unpaid at this rate.',
      ...(saved !== undefined && saved > 0 ? [`Interest saved vs minimums only: ${m(saved)}.`] : []),
      `Strategy check — avalanche: ${m(aval.totalInterest)} interest; snowball: ${m(snow.totalInterest)}.`,
    ],
    followUp: { question: `Did you make the ${m(round(target.minPayment + extra))} payment to ${target.name}?`, inDays: diffDays(today, nextDueDate(today, target.dueDay)) + 1 },
  };
}

// ------------------------------------------------------------ savings

function savings(p: Parsed, data: DataSet, today: ISODate): RafiqResponse {
  const c = data.settings.currency;
  const m = (n: number) => formatMoney(n, c);
  const goals = activeGoals(data.goals);
  const plan = monthlyPlan(data);
  if (!goals.length) {
    const target = round(plan.essentialBills * 3);
    return {
      verdict: 'info',
      headline: 'Start with an emergency fund',
      situation: 'You have no savings goals recorded.',
      constraints: [plan.unallocated > 0 ? `Your plan has ${m(plan.unallocated)} unallocated each month.` : 'Your plan has no unallocated money yet.'],
      recommendation: `Create an emergency fund of about three months of essential bills${target ? ` (${m(target)})` : ''} before other goals.`,
      steps: [
        { title: 'Add a goal: Emergency fund', amount: target || undefined, detail: 'Plan → Savings goals' },
        { title: `Contribute ${m(Math.max(0, Math.floor(plan.unallocated * 0.5)))} per month`, detail: 'Half of unallocated money.' },
      ],
      impact: [target && plan.unallocated > 0 ? `Reached in about ${months(Math.ceil(target / Math.max(1, Math.floor(plan.unallocated * 0.5))))}.` : 'Add income and bills to calculate a timeline.'],
      followUp: { question: 'Did you set up your emergency fund goal?', inDays: 3 },
    };
  }
  const lines = goals.map((g) => ({ g, gp: goalProgress(g, today) }));
  const behind = lines.filter((l) => !l.gp.onTrack);
  const amt = p.amount;
  return {
    verdict: behind.length ? 'caution' : 'yes',
    headline: behind.length ? `${behind.length} goal${behind.length > 1 ? 's are' : ' is'} behind schedule` : 'Your goals are on track',
    situation: lines.map((l) => `${l.g.name}: ${m(l.g.saved)} of ${m(l.g.target)} (${Math.round(l.gp.pct * 100)}%)`).join('. ') + '.',
    constraints: [`Unallocated each month: ${m(plan.unallocated)}.`],
    recommendation: behind.length
      ? `Raise ${behind[0].g.name} to ${m(behind[0].gp.requiredMonthly ?? 0)}/month or move its target date.`
      : amt
        ? `Putting ${m(amt)} in now is fine as long as bills before payday stay covered.`
        : 'Keep contributions automatic, on payday, before spending starts.',
    steps: [
      ...behind.map((l) => ({ title: `Increase ${l.g.name} to ${m(l.gp.requiredMonthly ?? 0)}/month`, detail: l.g.targetDate ? `Target ${formatDate(l.g.targetDate)}` : undefined })),
      { title: 'Move savings on payday, not at month-end' },
    ],
    impact: lines.map((l) => (l.gp.eta ? `${l.g.name}: reached around ${formatDate(l.gp.eta)}.` : `${l.g.name}: set a monthly contribution to get a date.`)),
    followUp: { question: 'Did you make this month’s savings contribution?', inDays: 7 },
  };
}

// ------------------------------------------------------------ status / general

function status(_p: Parsed, data: DataSet, today: ISODate): RafiqResponse {
  const c = data.settings.currency;
  const m = (n: number) => formatMoney(n, c);
  const sts = safeToSpend(data, today);
  const next = sts.commitments.slice(0, 3);
  const budgets = budgetStatus(data, today).filter((b) => b.state !== 'ok');
  const daily = averageDailyVariableSpend(data, today);
  return {
    verdict: sts.status === 'shortfall' ? 'no' : sts.status === 'tight' ? 'caution' : 'yes',
    headline:
      sts.status === 'shortfall'
        ? `You are ${m(-sts.safe)} short before payday`
        : `You can safely spend ${m(sts.safe)} until ${formatDate(sts.payday.date)}`,
    situation: `Available: ${m(sts.available)}. Payday in ${sts.payday.daysLeft} days.`,
    constraints: [
      next.length ? `Next bills: ${next.map((o) => `${o.name} ${m(o.amount)} (${formatDate(o.date)})`).join('; ')}.` : 'No bills due before payday.',
      ...budgets.map((b) => `${b.category}: ${m(b.spent)} of ${m(b.limit)}.`),
      ...(daily ? [`Recent daily spending: ${m(daily)}.`] : []),
    ],
    recommendation:
      sts.status === 'shortfall'
        ? 'Tell me "I overspent, help me recover" for a step-by-step plan.'
        : `Keep day-to-day spending under ${m(sts.perDay)} a day.`,
    steps: [
      { title: `Daily limit: ${m(sts.perDay)}` },
      ...next.slice(0, 2).map((o) => ({ title: `Keep ${m(o.amount)} for ${o.name}`, detail: `Due ${formatDate(o.date)}` })),
    ],
    impact: [`Holding the daily limit gets you to payday with every recorded bill paid.`],
    followUp: { question: `Did you stay under ${m(sts.perDay)} a day?`, inDays: Math.min(3, Math.max(1, sts.payday.daysLeft)) },
  };
}

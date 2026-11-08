import { useMemo } from 'react';
import { CalendarClock, Landmark, PiggyBank, Plus, Target, Wallet } from 'lucide-react';
import { Card, CardHead, Empty, KV, Progress, useMoney } from '../components/ui';
import { CashflowChart } from '../components/charts';
import { useStore } from '../store';
import { formatDate, monthlyFactor } from '../lib/dates';
import { activeGoals, averageDailyVariableSpend, balances, budgetStatus, cashflowProjection, goalProgress, monthlyPlan, safeToSpend } from '../lib/finance';
import type { Frequency } from '../lib/types';

const FREQ: Record<Frequency, string> = { once: 'One time', weekly: 'Weekly', biweekly: 'Every 2 weeks', monthly: 'Monthly', yearly: 'Yearly' };
const KIND_COLOR: Record<string, string> = { needs: 'var(--brand)', debt: 'var(--bad)', savings: 'var(--good)', wants: 'var(--accent)', free: 'var(--surface-3)' };

export function Plan() {
  const { data, today, openSheet } = useStore();
  const m = useMoney();
  const plan = useMemo(() => monthlyPlan(data), [data]);
  const bal = useMemo(() => balances(data), [data]);
  const budgets = useMemo(() => budgetStatus(data, today), [data, today]);
  const sts = useMemo(() => safeToSpend(data, today), [data, today]);
  const projection = useMemo(() => cashflowProjection(data, today, 60, averageDailyVariableSpend(data, today)), [data, today]);
  const income = data.recurring.filter((r) => r.kind === 'income');
  const bills = data.recurring.filter((r) => r.kind === 'expense' && r.frequency !== 'once');
  const oneOffs = data.recurring.filter((r) => r.kind === 'expense' && r.frequency === 'once' && r.active);
  const goals = data.goals;
  const allocTotal = plan.allocation.reduce((s, a) => s + a.amount, 0) || 1;

  return (
    <div className="stack">
      <div className="topbar"><div className="title"><h1>Financial plan</h1></div></div>

      <div className="grid-2">
        <div className="stack">
          <Card>
            <CardHead title="Monthly salary allocation" />
            {plan.income <= 0 ? (
              <Empty title="Add your income to build a plan">
                <button className="btn sm primary" style={{ marginTop: 10 }} onClick={() => openSheet({ kind: 'recurring', preset: { kind: 'income' } })}>Add income</button>
              </Empty>
            ) : (
              <>
                <div className="alloc-bar" aria-hidden>
                  {plan.allocation.map((a) => <span key={a.label} style={{ width: `${(a.amount / allocTotal) * 100}%`, background: KIND_COLOR[a.kind] }} title={`${a.label}: ${m(a.amount)}`} />)}
                </div>
                <div className="legend" style={{ marginTop: 10 }}>
                  {plan.allocation.map((a) => <span key={a.label}><i style={{ background: KIND_COLOR[a.kind] }} />{a.label}</span>)}
                </div>
                <div style={{ marginTop: 12 }}>
                  <KV k="Regular income" v={m(plan.income)} />
                  <KV k="Essential bills" v={m(-plan.essentialBills)} />
                  <KV k="Debt minimums" v={m(-plan.debtMinimums)} />
                  <KV k="Savings goals" v={m(-plan.savings)} />
                  <KV k="Other regular costs (discretionary)" v={m(-plan.discretionaryBills)} />
                  <KV k="Day-to-day spending limits" v={m(-plan.variableBudgets)} />
                  <KV total k={plan.unallocated >= 0 ? 'Unallocated' : 'Over-committed'} v={<span style={{ color: plan.unallocated < 0 ? 'var(--bad)' : 'var(--good)' }}>{m(plan.unallocated)}</span>} />
                </div>
                {plan.unallocated < 0 && <p className="small" style={{ color: 'var(--bad)', marginTop: 8 }}>Your plan spends more than you earn. Reduce limits or discretionary costs.</p>}
                <div className="divider" style={{ margin: '12px 0' }} />
                <div className="grid-3" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
                  <div className="stat"><div className="l">Essential vs discretionary</div><div className="v" style={{ fontSize: 16 }}>{Math.round(((plan.essentialBills + plan.debtMinimums) / plan.income) * 100)}% / {Math.round(((plan.discretionaryBills + plan.variableBudgets) / plan.income) * 100)}%</div><div className="s">of income</div></div>
                  <div className="stat"><div className="l">Weekly flexible budget</div><div className="v" style={{ fontSize: 16 }}>{m(plan.weeklyFlexible)}</div><div className="s">limits + unallocated ÷ 4.33</div></div>
                </div>
              </>
            )}
          </Card>

          <Card>
            <CardHead title="Spending limits" icon={<Target size={18} />} action={<button className="btn sm ghost" onClick={() => openSheet({ kind: 'budget' })}><Plus size={14} />Add</button>} />
            {budgets.length === 0 ? (
              <Empty title="No limits yet">Set a monthly limit for categories you tend to overspend on (eating out, shopping…).</Empty>
            ) : (
              <div className="stack-sm">
                {budgets.map((b) => (
                  <button key={b.category} className="btn ghost" style={{ display: 'block', textAlign: 'left', padding: '8px 4px', height: 'auto' }} onClick={() => openSheet({ kind: 'budget', category: b.category })}>
                    <div className="row between small" style={{ marginBottom: 6 }}>
                      <span style={{ fontWeight: 600 }}>{b.category}</span>
                      <span className="money">
                        {m(b.spent)} <span className="faint">/ {m(b.limit)}</span>
                        {b.state !== 'ok' && <span className={`badge ${b.state === 'over' ? 'bad' : 'warn'}`} style={{ marginLeft: 6 }}>{b.state === 'over' ? 'Over' : `On pace for ${m(b.projected)}`}</span>}
                      </span>
                    </div>
                    <Progress value={b.pct} tone={b.state === 'over' ? 'bad' : b.state === 'warning' ? 'warn' : 'good'} />
                  </button>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <CardHead title="Cash-flow projection · 60 days" icon={<CalendarClock size={18} />} />
            <CashflowChart points={projection} payday={sts.payday.date} />
            <p className="faint xs" style={{ marginTop: 6 }}>Lowest projected balance: {m(Math.min(...projection.map((p) => p.balance)))} on {formatDate(projection.reduce((a, b) => (b.balance < a.balance ? b : a)).date)}.</p>
          </Card>
        </div>

        <div className="stack">
          <Card>
            <CardHead title="Accounts & balances" icon={<Wallet size={18} />} action={<button className="btn sm ghost" onClick={() => openSheet({ kind: 'account' })}><Plus size={14} />Add</button>} />
            {data.accounts.filter((a) => !a.archived).length === 0 ? <Empty title="No accounts yet" /> : (
              <div className="list">
                {bal.byAccount.map(({ account, balance }) => (
                  <div key={account.id} className="list-row clickable" role="button" tabIndex={0} onClick={() => openSheet({ kind: 'account', id: account.id })}>
                    <div className="main-text"><div className="t">{account.name}</div><div className="s">{account.type === 'savings' ? 'Savings · not in safe-to-spend' : account.type[0].toUpperCase() + account.type.slice(1)}</div></div>
                    <span className="amt">{m(balance)}</span>
                  </div>
                ))}
                <KV total k="Total" v={m(bal.total)} />
              </div>
            )}
          </Card>

          <Card>
            <CardHead title="Income" icon={<Wallet size={18} />} action={<button className="btn sm ghost" onClick={() => openSheet({ kind: 'recurring', preset: { kind: 'income' } })}><Plus size={14} />Add</button>} />
            {income.length === 0 ? <Empty title="No income recorded" /> : (
              <div className="list">
                {income.map((r) => (
                  <div key={r.id} className="list-row clickable" role="button" tabIndex={0} onClick={() => openSheet({ kind: 'recurring', id: r.id })}>
                    <div className="main-text"><div className="t">{r.name}</div><div className="s">{FREQ[r.frequency]} · from {formatDate(r.startDate)}</div></div>
                    <span className="amt pos">{m(r.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <CardHead title="Regular expenses" icon={<CalendarClock size={18} />} action={<button className="btn sm ghost" onClick={() => openSheet({ kind: 'recurring', preset: { kind: 'expense' } })}><Plus size={14} />Add</button>} />
            {bills.length === 0 ? <Empty title="No regular bills" /> : (
              <div className="list">
                {bills.map((r) => (
                  <div key={r.id} className="list-row clickable" role="button" tabIndex={0} onClick={() => openSheet({ kind: 'recurring', id: r.id })}>
                    <div className="main-text"><div className="t">{r.name}</div><div className="s">{FREQ[r.frequency]} · {r.category}</div></div>
                    <span className={`badge ${r.essential ? 'brand' : ''}`}>{r.essential ? 'Essential' : 'Optional'}</span>
                    <span className="amt">{m(r.amount)}</span>
                  </div>
                ))}
                <KV total k="Per month" v={m(bills.reduce((s, r) => s + r.amount * monthlyFactor(r.frequency), 0))} />
              </div>
            )}
          </Card>

          <Card>
            <CardHead title="Expected commitments" icon={<Landmark size={18} />} action={<button className="btn sm ghost" onClick={() => openSheet({ kind: 'recurring', preset: { kind: 'expense', frequency: 'once' } })}><Plus size={14} />Add</button>} />
            {oneOffs.length === 0 ? <Empty title="None">School fees, car licence, Eid, weddings — add known one-off costs so they are reserved in advance.</Empty> : (
              <div className="list">
                {oneOffs.sort((a, b) => (a.startDate < b.startDate ? -1 : 1)).map((r) => (
                  <div key={r.id} className="list-row clickable" role="button" tabIndex={0} onClick={() => openSheet({ kind: 'recurring', id: r.id })}>
                    <div className="main-text"><div className="t">{r.name}</div><div className="s">Due {formatDate(r.startDate)}</div></div>
                    <span className="amt">{m(r.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <CardHead title="Savings goals" icon={<PiggyBank size={18} />} action={<button className="btn sm ghost" onClick={() => openSheet({ kind: 'goal' })}><Plus size={14} />Add</button>} />
            {goals.length === 0 ? <Empty title="No goals yet">Start with an emergency fund of 3 months’ essential bills.</Empty> : (
              <div className="stack">
                {goals.map((g) => {
                  const gp = goalProgress(g, today);
                  return (
                    <div key={g.id} className="stack-sm">
                      <div className="row between">
                        <button className="btn ghost sm" style={{ padding: 0, fontWeight: 650 }} onClick={() => openSheet({ kind: 'goal', id: g.id })}>{g.name}</button>
                        {!g.completedAt ? <button className="btn sm" onClick={() => openSheet({ kind: 'goal-contribution', goalId: g.id })}>Add money</button> : <span className="badge good">Reached</span>}
                      </div>
                      <Progress value={gp.pct} tone={gp.onTrack ? 'good' : 'warn'} />
                      <div className="faint xs">
                        {m(g.saved)} of {m(g.target)} · {m(g.monthlyContribution)}/month
                        {gp.eta && !g.completedAt && ` · reached ~${formatDate(gp.eta)}`}
                        {!gp.onTrack && gp.requiredMonthly !== undefined && <span style={{ color: 'var(--warn)' }}> · needs {m(gp.requiredMonthly)}/month for {formatDate(g.targetDate!)}</span>}
                      </div>
                    </div>
                  );
                })}
                {activeGoals(goals).length > 0 && <p className="faint xs">Planned contributions not yet made this pay period ({m(sts.savingsReserve)}) are reserved from safe-to-spend.</p>}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

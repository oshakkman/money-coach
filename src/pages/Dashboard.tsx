import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, CalendarClock, Check, CheckCircle2, ChevronDown, CircleDollarSign, Landmark, PiggyBank, ShieldAlert, Sparkles, TrendingDown, Wallet, X } from 'lucide-react';
import { Card, CardHead, Empty, Progress, useMoney } from '../components/ui';
import { CashflowChart } from '../components/charts';
import { useStore } from '../store';
import { addDays, diffDays, formatDate, monthKey, relativeDay, shiftMonth } from '../lib/dates';
import { activeGoals, averageDailyVariableSpend, balances, cashflowProjection, debtProgress, goalProgress, monthSummary, safeToSpend, upcomingCommitments, expectedIncome } from '../lib/finance';
import { backupDue, nextActions, type NextAction, type Route } from '../lib/nextAction';
import { sum } from '../lib/money';

export function Dashboard({ go }: { go: (r: Route) => void }) {
  const { data, today, openSheet, setActionStatus, updateSettings, toast } = useStore();
  const m = useMoney();
  const sts = useMemo(() => safeToSpend(data, today), [data, today]);
  const bal = useMemo(() => balances(data), [data]);
  const actions = useMemo(() => nextActions(data, today), [data, today]);
  const [showMore, setShowMore] = useState(false);
  const month = monthKey(today);
  const cur = useMemo(() => monthSummary(data, month), [data, month]);
  const prev = useMemo(() => monthSummary(data, shiftMonth(month, -1)), [data, month]);
  const upcoming = useMemo(() => upcomingCommitments(data, today, addDays(today, 21)), [data, today]);
  const incoming = useMemo(() => expectedIncome(data, today, addDays(today, 21)).filter((o) => o.date <= addDays(today, 21)), [data, today]);
  const projection = useMemo(() => cashflowProjection(data, today, Math.min(45, Math.max(14, sts.payday.daysLeft + 7)), averageDailyVariableSpend(data, today)), [data, today, sts.payday.daysLeft]);
  const openDebts = data.debts.filter((d) => !d.closedAt && d.balance > 0);
  const goals = activeGoals(data.goals);
  const openActions = data.actions.filter((a) => a.status === 'open').sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1));

  const runCta = (a: NextAction) => {
    const cta = a.cta;
    if (!cta) return;
    if (cta.route) return go(cta.route);
    if (cta.action === 'add-transaction') return openSheet({ kind: 'transaction' });
    if (cta.action === 'backup') return openSheet({ kind: 'backup' });
    if (cta.action === 'setup') return openSheet({ kind: 'account' });
    if (cta.action === 'action-done' && cta.ref) {
      setActionStatus(cta.ref, 'done');
      toast('Nice — marked done');
      return;
    }
    if (cta.action === 'pay-commitment' && cta.ref) {
      const o = sts.commitments.find((x) => x.key === cta.ref) ?? upcoming.find((x) => x.key === cta.ref);
      if (o) openSheet({ kind: 'settle', occurrence: o });
    }
  };

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const primary = actions[0];
  const statusBadge = sts.status === 'shortfall' ? <span className="badge bad"><ShieldAlert size={13} />Shortfall</span> : sts.status === 'tight' ? <span className="badge warn"><AlertTriangle size={13} />Tight</span> : <span className="badge good"><CheckCircle2 size={13} />On track</span>;

  return (
    <div className="stack">
      <div className="topbar">
        <div className="title">
          <span className="faint small">{formatDate(today, 'long')}</span>
          <h1>{greeting}</h1>
        </div>
      </div>

      {backupDue(data, today) && primary?.id !== 'backup' && (
        <div className="banner">
          <ShieldAlert size={18} />
          <span className="grow small">{data.settings.lastBackupAt ? `Last backup ${relativeDay(data.settings.lastBackupAt.slice(0, 10), today)}.` : 'No backup yet.'} Your data exists only on this device.</span>
          <button className="btn sm" onClick={() => openSheet({ kind: 'backup' })}>Back up</button>
          <button className="icon-btn" aria-label="Remind me tomorrow" onClick={() => updateSettings({ backupReminderSnoozedUntil: addDays(today, 1) })}><X size={16} /></button>
        </div>
      )}

      {data.accounts.length === 0 && <SetupChecklist />}

      {data.accounts.length > 0 && (
        <div className="grid-2">
          {/* 1 + 2: where do I stand / what can I safely spend */}
          <Card className="hero">
            <div className="row between">
              <span className="small muted">Safe to spend until {formatDate(sts.payday.date)}</span>
              {statusBadge}
            </div>
            <div className="hero-amount" style={{ marginTop: 8 }} data-testid="safe-to-spend">
              {sts.safe < 0 ? '−' : ''}
              {m(Math.abs(sts.safe)).replace(` ${data.settings.currency}`, '')}
              <span className="cur">{data.settings.currency}</span>
            </div>
            <div className="small muted" style={{ marginTop: 6 }}>
              {sts.safe > 0 ? <>About <b style={{ color: 'inherit' }}>{m(sts.perDay)}</b> a day for {sts.payday.daysLeft} days</> : sts.safe < 0 ? 'Commitments before payday exceed your available money' : 'Nothing spare until payday'}
            </div>
            <div className="hero-split">
              <div>
                <div className="l">Available</div>
                <div className="v" data-testid="available">{m(bal.spendable)}</div>
              </div>
              <div>
                <div className="l">Committed</div>
                <div className="v">{m(sts.commitmentsTotal + sts.savingsReserve + sts.buffer)}</div>
              </div>
              <div>
                <div className="l">To payday</div>
                <div className="v">{sts.payday.daysLeft} days</div>
              </div>
            </div>
            {sts.payday.source !== 'income' && (
              <button className="btn sm" style={{ marginTop: 14 }} onClick={() => openSheet({ kind: 'recurring', preset: { kind: 'income' } })}>Add your payday for accuracy</button>
            )}
          </Card>

          {/* 3: what should I do next */}
          <div className="stack">
            {primary && (
              <Card className={`next-action ${primary.tone}`} data-testid="next-action">
                <div className="na-icon">{primary.tone === 'critical' ? <ShieldAlert size={20} /> : primary.tone === 'warning' ? <AlertTriangle size={20} /> : primary.tone === 'good' ? <Sparkles size={20} /> : <ArrowRight size={20} />}</div>
                <div className="grow stack-sm">
                  <span className="eyebrow">Do this next</span>
                  <h2>{primary.title}</h2>
                  <p className="muted small">{primary.detail}</p>
                  {primary.cta && (
                    <div className="row wrap" style={{ marginTop: 4 }}>
                      <button className="btn primary sm" onClick={() => runCta(primary)}>{primary.cta.label}</button>
                      {actions.length > 1 && (
                        <button className="btn ghost sm" onClick={() => setShowMore((s) => !s)} aria-expanded={showMore}>
                          {actions.length - 1} more <ChevronDown size={14} style={{ transform: showMore ? 'rotate(180deg)' : undefined }} />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </Card>
            )}
            {showMore && (
              <Card className="tight">
                <div className="list">
                  {actions.slice(1).map((a) => (
                    <div key={a.id} className="list-row">
                      <div className="main-text">
                        <div className="t">{a.title}</div>
                        <div className="s">{a.detail}</div>
                      </div>
                      {a.cta && <button className="btn sm" onClick={() => runCta(a)}>{a.cta.label}</button>}
                    </div>
                  ))}
                </div>
              </Card>
            )}
            <div className="grid-3" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
              <button className="btn" onClick={() => openSheet({ kind: 'transaction' })}><CircleDollarSign size={18} />Add spending</button>
              <button className="btn" onClick={() => go('rafiq')}><Sparkles size={18} />Ask Rafiq</button>
            </div>
          </div>
        </div>
      )}

      {data.accounts.length > 0 && <SetupChecklist />}

      {data.accounts.length > 0 && (
        <div className="grid-2">
          <div className="stack">
            <Card>
              <CardHead title="Coming up" icon={<CalendarClock size={18} />} action={<button className="btn sm ghost" onClick={() => openSheet({ kind: 'recurring', preset: { kind: 'expense', frequency: 'once' } })}>Add</button>} />
              {upcoming.length + incoming.length === 0 ? (
                <Empty title="No bills in the next 3 weeks">Add rent, utilities and other regular costs in Plan.</Empty>
              ) : (
                <div className="list">
                  {[...upcoming, ...incoming.filter((o) => !o.overdue)]
                    .sort((a, b) => (a.date < b.date ? -1 : 1))
                    .slice(0, 8)
                    .map((o) => (
                      <div key={o.key} className="list-row">
                        <div className="cat-dot" style={o.kind === 'income' ? { color: 'var(--good)' } : o.overdue ? { color: 'var(--bad)' } : undefined}>
                          {o.kind === 'income' ? <Wallet size={16} /> : o.source === 'debt' ? <Landmark size={16} /> : <CalendarClock size={16} />}
                        </div>
                        <div className="main-text">
                          <div className="t">{o.name}</div>
                          <div className="s">
                            {o.overdue ? <span style={{ color: 'var(--bad)', fontWeight: 600 }}>Overdue · {formatDate(o.date)}</span> : relativeDay(o.date, today)}
                            {o.kind === 'expense' && !o.essential && ' · optional'}
                          </div>
                        </div>
                        <span className={`amt ${o.kind === 'income' ? 'pos' : ''}`}>{m(o.kind === 'income' ? o.amount : -o.amount, { sign: o.kind === 'income' })}</span>
                        <button className="icon-btn" title={o.kind === 'income' ? 'Mark received' : 'Mark paid'} aria-label={`Mark ${o.name} ${o.kind === 'income' ? 'received' : 'paid'}`} onClick={() => openSheet({ kind: 'settle', occurrence: o })}>
                          <Check size={18} />
                        </button>
                      </div>
                    ))}
                </div>
              )}
            </Card>

            <Card>
              <CardHead title="Cash-flow forecast" icon={<TrendingDown size={18} />} />
              <CashflowChart points={projection} payday={sts.payday.date} />
              <p className="faint xs" style={{ marginTop: 6 }}>
                Includes scheduled bills, debt minimums, expected income{averageDailyVariableSpend(data, today) > 0 ? ` and your recent average day-to-day spending (${m(averageDailyVariableSpend(data, today))}/day)` : ''}.
                {projection.some((p) => p.balance < 0) && <span style={{ color: 'var(--bad)', fontWeight: 600 }}> Balance goes negative on {formatDate(projection.find((p) => p.balance < 0)!.date)}.</span>}
              </p>
            </Card>
          </div>

          <div className="stack">
            <Card>
              <CardHead title={`This month`} action={<button className="btn sm ghost" onClick={() => go('transactions')}>Details</button>} />
              <div className="grid-3" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                <div className="stat"><div className="l">Income</div><div className="v" style={{ fontSize: 17 }}>{m(cur.income)}</div></div>
                <div className="stat"><div className="l">Spent</div><div className="v" style={{ fontSize: 17 }}>{m(cur.spending)}</div>
                  {prev.spending > 0 && <div className="s">{cur.spending > prev.spending ? '▲' : '▼'} vs {m(prev.spending)} last month</div>}
                </div>
                <div className="stat"><div className="l">Saved</div><div className="v" style={{ fontSize: 17 }}>{m(cur.saved)}</div></div>
              </div>
              {cur.spending > 0 && (
                <>
                  <div className="divider" style={{ margin: '14px 0 10px' }} />
                  <div className="row between small"><span className="muted">Essential</span><span className="money">{m(cur.essential)}</span></div>
                  <div className="row between small" style={{ marginTop: 4 }}><span className="muted">Discretionary</span><span className="money">{m(cur.discretionary)}</span></div>
                </>
              )}
            </Card>

            {openDebts.length > 0 && (
              <Card>
                <CardHead title="Debt" icon={<Landmark size={18} />} action={<button className="btn sm ghost" onClick={() => go('debts')}>Plan</button>} />
                <div className="row between" style={{ marginBottom: 8 }}>
                  <span className="muted small">Owed</span>
                  <strong className="money">{m(sum(openDebts.map((d) => d.balance)))}</strong>
                </div>
                {(() => {
                  const orig = sum(openDebts.map((d) => d.originalBalance));
                  const paid = sum(openDebts.map((d) => debtProgress(d).paid));
                  return (
                    <>
                      <Progress value={orig ? paid / orig : 0} tone="good" />
                      <div className="faint xs" style={{ marginTop: 6 }}>{m(paid)} paid off of {m(orig)} ({orig ? Math.round((paid / orig) * 100) : 0}%)</div>
                    </>
                  );
                })()}
              </Card>
            )}

            {goals.length > 0 && (
              <Card>
                <CardHead title="Savings" icon={<PiggyBank size={18} />} action={<button className="btn sm ghost" onClick={() => go('plan')}>Goals</button>} />
                <div className="stack-sm">
                  {goals.slice(0, 3).map((g) => {
                    const gp = goalProgress(g, today);
                    return (
                      <div key={g.id}>
                        <div className="row between small"><span style={{ fontWeight: 560 }}>{g.name}</span><span className="money muted">{m(g.saved)} / {m(g.target)}</span></div>
                        <Progress value={gp.pct} tone={gp.onTrack ? 'good' : 'warn'} />
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}

            {openActions.length > 0 && (
              <Card>
                <CardHead title="Your commitments" icon={<CheckCircle2 size={18} />} action={<button className="btn sm ghost" onClick={() => go('rafiq')}>All</button>} />
                <div className="list">
                  {openActions.slice(0, 4).map((a) => (
                    <div key={a.id} className="list-row">
                      <button className="icon-btn" aria-label={`Mark "${a.title}" done`} onClick={() => setActionStatus(a.id, 'done')}><span className="check-circle" /></button>
                      <div className="main-text">
                        <div className="t">{a.title}</div>
                        <div className="s" style={a.dueDate < today ? { color: 'var(--bad)' } : undefined}>{a.dueDate < today ? `Overdue by ${diffDays(a.dueDate, today)} days` : `Due ${relativeDay(a.dueDate, today)}`}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SetupChecklist() {
  const { data, openSheet, updateSettings } = useStore();
  if (data.settings.onboardingDismissed) return null;
  const items = [
    { key: 'bal', label: 'Current balances', hint: 'Cash and bank accounts', done: data.accounts.length > 0, open: () => openSheet({ kind: 'account' }) },
    { key: 'inc', label: 'Income and payday', hint: 'So Rafiq knows how long money must last', done: data.recurring.some((r) => r.kind === 'income'), open: () => openSheet({ kind: 'recurring', preset: { kind: 'income' } }) },
    { key: 'bills', label: 'Regular expenses', hint: 'Rent, utilities, phone, school…', done: data.recurring.some((r) => r.kind === 'expense' && r.frequency !== 'once'), open: () => openSheet({ kind: 'recurring', preset: { kind: 'expense' } }) },
    { key: 'debt', label: 'Debts and repayments', hint: 'Cards, loans, money owed', done: data.debts.length > 0, open: () => openSheet({ kind: 'debt' }) },
    { key: 'goal', label: 'Savings goals', hint: 'Emergency fund, travel, car…', done: data.goals.length > 0, open: () => openSheet({ kind: 'goal' }) },
    { key: 'once', label: 'Expected commitments', hint: 'One-off costs coming up', done: data.recurring.some((r) => r.frequency === 'once'), open: () => openSheet({ kind: 'recurring', preset: { kind: 'expense', frequency: 'once' } }) },
  ];
  const done = items.filter((i) => i.done).length;
  if (done === items.length) return null;
  return (
    <Card>
      <CardHead
        title={done === 0 ? 'Set up your baseline' : `Setup · ${done} of ${items.length}`}
        action={done >= 2 ? <button className="btn sm ghost" onClick={() => updateSettings({ onboardingDismissed: true })}>Hide</button> : undefined}
      />
      <p className="muted small" style={{ marginBottom: 6 }}>Add what you know now — you can fill in the rest any time. Rafiq never invents numbers.</p>
      <div>
        {items.map((i) => (
          <button key={i.key} className={`check-item ${i.done ? 'done' : ''}`} onClick={i.open}>
            <span className="check-circle"><Check size={14} /></span>
            <span className="grow">
              <span className="t" style={{ fontWeight: 560, display: 'block' }}>{i.label}</span>
              <span className="faint xs">{i.hint}</span>
            </span>
            <ArrowRight size={16} color="var(--ink-3)" />
          </button>
        ))}
      </div>
    </Card>
  );
}

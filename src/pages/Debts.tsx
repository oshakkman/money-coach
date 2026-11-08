import { useMemo, useState } from 'react';
import { Landmark, Plus, Sparkles, Trophy } from 'lucide-react';
import { Card, CardHead, Empty, Field, KV, Progress, Segmented, useMoney } from '../components/ui';
import { DebtPayoffChart } from '../components/charts';
import { useStore } from '../store';
import { addMonthsClamped, formatDate } from '../lib/dates';
import { debtProgress, orderDebts, recommendedDebtExtra, simulateDebts, type DebtStrategy } from '../lib/finance';
import { parseAmount, sum } from '../lib/money';

const monthsText = (n: number) => (!Number.isFinite(n) ? 'never at this rate' : n < 12 ? `${n} months` : `${Math.floor(n / 12)}y ${n % 12}m`);

export function Debts() {
  const { data, today, openSheet } = useStore();
  const m = useMoney();
  const open = data.debts.filter((d) => !d.closedAt && d.balance > 0);
  const closed = data.debts.filter((d) => d.closedAt || d.balance <= 0);
  const rec = useMemo(() => recommendedDebtExtra(data, today), [data, today]);
  const [extraText, setExtraText] = useState<string | null>(null);
  const extra = extraText === null ? rec.amount : Math.max(0, parseAmount(extraText) || 0);
  const [strategy, setStrategy] = useState<DebtStrategy>('avalanche');
  const aval = useMemo(() => simulateDebts(open, extra, 'avalanche'), [open, extra]);
  const snow = useMemo(() => simulateDebts(open, extra, 'snowball'), [open, extra]);
  const base = useMemo(() => simulateDebts(open, 0, 'avalanche'), [open]);
  const chosen = strategy === 'avalanche' ? aval : snow;
  const total = sum(open.map((d) => d.balance));
  const original = sum(open.map((d) => d.originalBalance));
  const monthlyInterest = sum(open.map((d) => (d.balance * d.apr) / 1200));
  const order = orderDebts(open, strategy);

  return (
    <div className="stack">
      <div className="topbar">
        <div className="title"><h1>Debts</h1></div>
        <button className="btn primary sm" onClick={() => openSheet({ kind: 'debt' })}><Plus size={16} />Add debt</button>
      </div>

      {open.length === 0 ? (
        <Card>
          <Empty icon={closed.length ? <Trophy size={28} color="var(--good)" /> : <Landmark size={28} />} title={closed.length ? 'Debt-free!' : 'No debts recorded'}>
            {closed.length ? `You cleared ${closed.length} debt${closed.length > 1 ? 's' : ''}.` : 'Add a credit card, loan or money owed to plan your repayment.'}
          </Empty>
        </Card>
      ) : (
        <div className="grid-2">
          <div className="stack">
            <Card>
              <div className="grid-3" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                <div className="stat"><div className="l">Total owed</div><div className="v">{m(total)}</div></div>
                <div className="stat"><div className="l">Interest / month</div><div className="v" style={{ color: 'var(--bad)' }}>≈{m(monthlyInterest)}</div></div>
                <div className="stat"><div className="l">Debt-free</div><div className="v" style={{ fontSize: 16 }}>{chosen.feasible ? formatDate(addMonthsClamped(today, chosen.months)) : '—'}</div><div className="s">{monthsText(chosen.months)}</div></div>
              </div>
              <div style={{ marginTop: 14 }}>
                <Progress value={original ? (original - total) / original : 0} tone="good" />
                <div className="faint xs" style={{ marginTop: 6 }}>{m(original - total)} repaid since you started tracking</div>
              </div>
            </Card>

            <Card>
              <CardHead title="Your debts" />
              <div className="stack">
                {order.map((d, i) => {
                  const p = debtProgress(d);
                  const payoff = chosen.payoffOrder.find((x) => x.id === d.id);
                  return (
                    <div key={d.id} className="stack-sm" style={{ paddingBottom: 12, borderBottom: '1px solid var(--line)' }}>
                      <div className="row between">
                        <div>
                          <div className="row" style={{ gap: 6 }}>
                            <span className="badge brand">#{i + 1}</span>
                            <strong>{d.name}</strong>
                          </div>
                          <div className="faint xs" style={{ marginTop: 3 }}>{d.apr}% APR · min {m(d.minPayment)} · due day {d.dueDay}</div>
                        </div>
                        <strong className="money">{m(d.balance)}</strong>
                      </div>
                      <Progress value={p.pct} tone="good" />
                      <div className="row between">
                        <span className="faint xs">{Math.round(p.pct * 100)}% paid · cleared {payoff ? `in ${monthsText(payoff.month)}` : 'never at minimums'}</span>
                        <div className="row" style={{ gap: 6 }}>
                          <button className="btn sm ghost" onClick={() => openSheet({ kind: 'debt', id: d.id })}>Edit</button>
                          <button className="btn sm" onClick={() => openSheet({ kind: 'debt-payment', debtId: d.id })}>Record payment</button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="faint xs" style={{ marginTop: 10 }}>Order shown follows the {strategy} strategy. Update balances from statements monthly — interest is not added automatically.</p>
            </Card>
          </div>

          <div className="stack">
            <Card>
              <CardHead title="Repayment strategy" icon={<Sparkles size={18} />} />
              <div className="stack">
                <Field label="Extra per month on top of minimums" hint={extraText === null ? `Recommended: ${m(rec.amount)} — ${rec.reason}` : <button className="btn ghost sm" style={{ padding: 0, minHeight: 0 }} onClick={() => setExtraText(null)}>Reset to recommended ({m(rec.amount)})</button>}>
                  {(id) => <input id={id} className="input" inputMode="decimal" value={extraText ?? String(rec.amount)} onChange={(e) => setExtraText(e.target.value)} />}
                </Field>
                <Segmented label="Strategy" value={strategy} onChange={setStrategy} options={[{ value: 'avalanche', label: 'Avalanche' }, { value: 'snowball', label: 'Snowball' }]} />
                <p className="muted small">{strategy === 'avalanche' ? 'Avalanche: extra money goes to the highest interest rate first. Saves the most money.' : 'Snowball: extra money goes to the smallest balance first. Quicker wins, usually costs a bit more.'}</p>
                <div className="grid-3" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
                  {[aval, snow].map((s) => (
                    <div key={s.strategy} className="card flat tight" style={{ borderColor: s.strategy === strategy ? 'var(--brand)' : undefined }}>
                      <div className="eyebrow">{s.strategy}</div>
                      <div style={{ fontWeight: 680, fontSize: 17, marginTop: 4 }}>{monthsText(s.months)}</div>
                      <div className="faint xs">{m(s.totalInterest)} interest</div>
                    </div>
                  ))}
                </div>
                {extra <= 0 && <p className="faint small">With no extra payment, both strategies are the same — the order only matters for money paid on top of minimums.</p>}
                {aval.feasible && snow.feasible && snow.totalInterest - aval.totalInterest >= 1 && (
                  <p className="small">Avalanche saves <b>{m(snow.totalInterest - aval.totalInterest)}</b> in interest{snow.months !== aval.months ? ` and ${Math.abs(snow.months - aval.months)} month(s)` : ''}.</p>
                )}
                {base.feasible && chosen.feasible && extra > 0 && (
                  <p className="small">Compared with minimums only, paying {m(extra)} extra saves <b>{m(base.totalInterest - chosen.totalInterest)}</b> and <b>{base.months - chosen.months} months</b>.</p>
                )}
                {!chosen.feasible && <p className="small" style={{ color: 'var(--bad)' }}>At this payment level some debts never get paid off because interest is larger than the payment. Increase the extra amount.</p>}
              </div>
            </Card>

            {chosen.firstMonthPlan.length > 0 && (
              <Card>
                <CardHead title="This month, pay" />
                {chosen.firstMonthPlan.map((p) => <KV key={p.id} k={p.name} v={m(p.payment)} />)}
                <KV total k="Total" v={m(sum(chosen.firstMonthPlan.map((p) => p.payment)))} />
              </Card>
            )}

            <Card>
              <CardHead title="Balance over time" />
              <DebtPayoffChart a={aval.timeline} b={snow.timeline} />
            </Card>
          </div>
        </div>
      )}

      {closed.length > 0 && open.length > 0 && (
        <Card>
          <CardHead title="Paid off" icon={<Trophy size={18} />} />
          {closed.map((d) => <KV key={d.id} k={d.name} v={<span className="badge good">Cleared {d.closedAt ? formatDate(d.closedAt.slice(0, 10)) : ''}</span>} />)}
        </Card>
      )}
    </div>
  );
}

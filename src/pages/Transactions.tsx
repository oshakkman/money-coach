import { useMemo, useState } from 'react';
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, ChevronLeft, ChevronRight, Plus, Repeat, Search } from 'lucide-react';
import { Card, CardHead, Empty, useMoney } from '../components/ui';
import { CategoryBars, MonthCompareChart } from '../components/charts';
import { useStore } from '../store';
import { formatDate, monthKey, monthLabel, shiftMonth } from '../lib/dates';
import { monthHistory, monthSummary } from '../lib/finance';
import type { TxType } from '../lib/types';

export function Transactions() {
  const { data, today, openSheet } = useStore();
  const m = useMoney();
  const [month, setMonth] = useState(monthKey(today));
  const [q, setQ] = useState('');
  const [type, setType] = useState<TxType | 'all'>('all');
  const [cat, setCat] = useState('all');
  const accountName = (id?: string) => data.accounts.find((a) => a.id === id)?.name ?? '—';

  const summary = useMemo(() => monthSummary(data, month), [data, month]);
  const prevSummary = useMemo(() => monthSummary(data, shiftMonth(month, -1)), [data, month]);
  const history = useMemo(() => monthHistory(data, month, 6), [data, month]);
  const prevMap = useMemo(() => new Map(prevSummary.byCategory.map((c) => [c.category, c.amount])), [prevSummary]);
  const categories = useMemo(() => [...new Set(data.transactions.map((t) => t.category))].sort(), [data.transactions]);

  const list = useMemo(() => {
    const query = q.trim().toLowerCase();
    return data.transactions
      .filter((t) => (query ? true : monthKey(t.date) === month))
      .filter((t) => type === 'all' || t.type === type)
      .filter((t) => cat === 'all' || t.category === cat)
      .filter((t) => !query || [t.category, t.note ?? '', String(t.amount), accountName(t.accountId)].some((s) => s.toLowerCase().includes(query)))
      .sort((a, b) => (a.date === b.date ? (a.createdAt < b.createdAt ? 1 : -1) : a.date < b.date ? 1 : -1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, month, q, type, cat]);

  const grouped = useMemo(() => {
    const g = new Map<string, typeof list>();
    for (const t of list) g.set(t.date, [...(g.get(t.date) ?? []), t]);
    return [...g.entries()];
  }, [list]);

  const spendChange = prevSummary.spending ? (summary.spending - prevSummary.spending) / prevSummary.spending : 0;

  return (
    <div className="stack">
      <div className="topbar">
        <div className="title"><h1>Transactions</h1></div>
        <button className="btn primary sm" onClick={() => openSheet({ kind: 'transaction' })}><Plus size={16} />Add</button>
      </div>

      <div className="row between">
        <button className="icon-btn" aria-label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))}><ChevronLeft /></button>
        <strong>{monthLabel(month)}</strong>
        <button className="icon-btn" aria-label="Next month" disabled={month >= monthKey(today)} onClick={() => setMonth(shiftMonth(month, 1))}><ChevronRight /></button>
      </div>

      <div className="grid-2">
        <div className="stack">
          <Card className="tight">
            <div className="row" style={{ gap: 8, marginBottom: 10 }}>
              <div className="row grow" style={{ position: 'relative' }}>
                <Search size={16} style={{ position: 'absolute', left: 12, color: 'var(--ink-3)' }} />
                <input className="input" style={{ paddingLeft: 36 }} placeholder="Search all transactions" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search transactions" />
              </div>
            </div>
            <div className="chips" style={{ marginBottom: 6 }}>
              {(['all', 'expense', 'income', 'transfer'] as const).map((t) => (
                <button key={t} className="chip" aria-pressed={type === t} onClick={() => setType(t)}>{t === 'all' ? 'All' : t[0].toUpperCase() + t.slice(1)}</button>
              ))}
              <select className="chip" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Filter by category">
                <option value="all">All categories</option>
                {categories.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            {q && <p className="faint xs">Searching all months · {list.length} results</p>}
            {grouped.length === 0 ? (
              <Empty title={q ? 'No matches' : 'No transactions this month'}>{!q && 'Tap Add to record spending or income.'}</Empty>
            ) : (
              <div className="list" data-testid="tx-list">
                {grouped.map(([date, txs]) => (
                  <div key={date}>
                    <div className="date-head">{formatDate(date, 'long')}</div>
                    {txs.map((t) => (
                      <div key={t.id} className="list-row clickable" onClick={() => openSheet({ kind: 'transaction', tx: t })} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && openSheet({ kind: 'transaction', tx: t })}>
                        <div className="cat-dot" style={t.type === 'income' ? { color: 'var(--good)' } : undefined}>
                          {t.type === 'income' ? <ArrowDownLeft size={16} /> : t.type === 'transfer' ? <ArrowLeftRight size={16} /> : <ArrowUpRight size={16} />}
                        </div>
                        <div className="main-text">
                          <div className="t">{t.note || t.category}</div>
                          <div className="s">
                            {t.type === 'transfer' ? `${accountName(t.accountId)} → ${accountName(t.toAccountId)}` : `${t.category} · ${accountName(t.accountId)}`}
                            {t.recurringId && <> · <Repeat size={11} style={{ verticalAlign: -1 }} /></>}
                          </div>
                        </div>
                        <span className={`amt ${t.type === 'income' ? 'pos' : ''}`}>{t.type === 'income' ? m(t.amount, { sign: true }) : t.type === 'transfer' ? m(t.amount) : m(-t.amount)}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="stack">
          <Card>
            <CardHead title="Summary" />
            <div className="grid-3" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
              <div className="stat"><div className="l">Income</div><div className="v" style={{ fontSize: 16 }}>{m(summary.income)}</div></div>
              <div className="stat"><div className="l">Spending</div><div className="v" style={{ fontSize: 16 }}>{m(summary.spending)}</div>
                {prevSummary.spending > 0 && <div className="s" style={{ color: spendChange > 0.05 ? 'var(--warn)' : undefined }}>{spendChange >= 0 ? '+' : ''}{Math.round(spendChange * 100)}% vs last month</div>}
              </div>
              <div className="stat"><div className="l">Net</div><div className="v" style={{ fontSize: 16, color: summary.net < 0 ? 'var(--bad)' : undefined }}>{m(summary.net, { sign: true })}</div></div>
            </div>
          </Card>
          <Card>
            <CardHead title="Where the money went" />
            {summary.byCategory.length ? <CategoryBars items={summary.byCategory.slice(0, 8)} previous={prevMap} /> : <Empty title="No spending recorded" />}
            {summary.byCategory.length > 0 && <p className="faint xs" style={{ marginTop: 8 }}>▲▼ change vs {monthLabel(shiftMonth(month, -1))}.</p>}
          </Card>
          <Card>
            <CardHead title="Last 6 months" />
            <MonthCompareChart months={history} />
          </Card>
        </div>
      </div>
    </div>
  );
}

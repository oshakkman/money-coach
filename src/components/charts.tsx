import { useEffect, useState } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatDate, monthLabel } from '../lib/dates';
import type { ProjectionPoint, MonthSummary } from '../lib/finance';
import { useMoney } from './ui';

function readVar(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** Chart colours come from CSS variables so light/dark themes stay in sync. */
export function useChartColors() {
  const read = () => ({
    s1: readVar('--series-1'),
    s2: readVar('--series-2'),
    brand: readVar('--brand'),
    grid: readVar('--grid'),
    ink3: readVar('--ink-3'),
    bad: readVar('--bad'),
    surface: readVar('--surface'),
  });
  const [c, setC] = useState(read);
  useEffect(() => {
    const update = () => setC(read());
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', update);
    const obs = new MutationObserver(update);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => {
      mq.removeEventListener('change', update);
      obs.disconnect();
    };
  }, []);
  return c;
}

const axisProps = { tickLine: false, axisLine: false, fontSize: 11 } as const;
const compact = (n: number) => (Math.abs(n) >= 1000 ? `${Math.round(n / 100) / 10}k` : String(Math.round(n)));

export function CashflowChart({ points, payday }: { points: ProjectionPoint[]; payday?: string }) {
  const c = useChartColors();
  const m = useMoney();
  const min = Math.min(0, ...points.map((p) => p.balance));
  return (
    <div className="chart-wrap" role="img" aria-label="Projected balance by day">
      <ResponsiveContainer>
        <AreaChart data={points} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
          <defs>
            <linearGradient id="cf" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={c.s1} stopOpacity={0.22} />
              <stop offset="100%" stopColor={c.s1} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={c.grid} />
          <XAxis dataKey="date" {...axisProps} tickFormatter={(d) => formatDate(d)} minTickGap={28} stroke={c.ink3} />
          <YAxis {...axisProps} tickFormatter={compact} width={44} domain={[min, 'auto']} stroke={c.ink3} />
          <ReferenceLine y={0} stroke={c.bad} strokeDasharray="4 4" />
          {payday && <ReferenceLine x={payday} stroke={c.ink3} strokeDasharray="2 4" label={{ value: 'Payday', position: 'insideTopRight', fill: c.ink3, fontSize: 11 }} />}
          <Tooltip
            cursor={{ stroke: c.ink3, strokeWidth: 1 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as ProjectionPoint;
              return (
                <div className="chart-tip">
                  <div className="d">{formatDate(p.date, 'long')}</div>
                  <div className="v">{m(p.balance)}</div>
                  {p.events.map((e, i) => (
                    <div key={i} className="xs muted">{e.name}: {m(e.amount, { sign: true })}</div>
                  ))}
                </div>
              );
            }}
          />
          <Area type="monotone" dataKey="balance" stroke={c.s1} strokeWidth={2} fill="url(#cf)" isAnimationActive={false} dot={false} activeDot={{ r: 5, stroke: c.surface, strokeWidth: 2 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function MonthCompareChart({ months }: { months: MonthSummary[] }) {
  const c = useChartColors();
  const m = useMoney();
  const rows = months.map((x) => ({ month: x.month, Income: x.income, Spending: x.spending }));
  return (
    <div>
      <div className="legend" style={{ marginBottom: 8 }}>
        <span><i style={{ background: c.s1 }} />Income</span>
        <span><i style={{ background: c.s2 }} />Spending</span>
      </div>
      <div className="chart-wrap" style={{ height: 200 }} role="img" aria-label="Income and spending by month">
        <ResponsiveContainer>
          <BarChart data={rows} margin={{ top: 4, right: 4, left: -8, bottom: 0 }} barGap={2} barCategoryGap="28%">
            <CartesianGrid vertical={false} stroke={c.grid} />
            <XAxis dataKey="month" {...axisProps} tickFormatter={(k) => monthLabel(k).split(' ')[0]} stroke={c.ink3} />
            <YAxis {...axisProps} tickFormatter={compact} width={44} stroke={c.ink3} />
            <Tooltip
              cursor={{ fill: c.grid, opacity: 0.5 }}
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <div className="chart-tip">
                    <div className="d">{monthLabel(String(label))}</div>
                    {payload.map((p) => (
                      <div key={String(p.dataKey)} className="v">{String(p.dataKey)}: {m(Number(p.value))}</div>
                    ))}
                  </div>
                ) : null
              }
            />
            <Bar dataKey="Income" fill={c.s1} radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false} />
            <Bar dataKey="Spending" fill={c.s2} radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function CategoryBars({ items, previous }: { items: { category: string; amount: number }[]; previous?: Map<string, number> }) {
  const m = useMoney();
  const max = Math.max(...items.map((i) => i.amount), 1);
  return (
    <div role="list">
      {items.map((i) => {
        const prev = previous?.get(i.category);
        const diff = prev !== undefined ? i.amount - prev : undefined;
        return (
          <div className="hbar" role="listitem" key={i.category} title={`${i.category}: ${m(i.amount)}${prev !== undefined ? ` (last month ${m(prev)})` : ''}`}>
            <span className="small" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.category}</span>
            <div className="track"><div className="fill" style={{ width: `${(i.amount / max) * 100}%` }} /></div>
            <span className="small money" style={{ textAlign: 'right', minWidth: 70 }}>
              {m(i.amount)}
              {diff !== undefined && Math.abs(diff) >= 1 && (
                <span className="xs" style={{ display: 'block', color: diff > 0 ? 'var(--warn)' : 'var(--good)' }}>
                  {diff > 0 ? '▲' : '▼'} {m(Math.abs(diff))}
                </span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function DebtPayoffChart({ a, b }: { a: { month: number; total: number }[]; b: { month: number; total: number }[] }) {
  const c = useChartColors();
  const m = useMoney();
  const len = Math.max(a.length, b.length);
  const rows = Array.from({ length: len }, (_, i) => ({ month: i, Avalanche: a[i]?.total ?? 0, Snowball: b[i]?.total ?? 0 }));
  return (
    <div>
      <div className="legend" style={{ marginBottom: 8 }}>
        <span><i style={{ background: c.s1 }} />Avalanche (highest interest first)</span>
        <span><i style={{ background: c.s2 }} />Snowball (smallest balance first)</span>
      </div>
      <div className="chart-wrap" role="img" aria-label="Total debt remaining by month for each strategy">
        <ResponsiveContainer>
          <LineChart data={rows} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={c.grid} />
            <XAxis dataKey="month" {...axisProps} tickFormatter={(v) => `${v}m`} minTickGap={24} stroke={c.ink3} />
            <YAxis {...axisProps} tickFormatter={compact} width={44} stroke={c.ink3} />
            <Tooltip
              cursor={{ stroke: c.ink3, strokeWidth: 1 }}
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <div className="chart-tip">
                    <div className="d">Month {label}</div>
                    {payload.map((p) => (
                      <div key={String(p.dataKey)} className="v">{String(p.dataKey)}: {m(Number(p.value))}</div>
                    ))}
                  </div>
                ) : null
              }
            />
            <Line type="monotone" dataKey="Avalanche" stroke={c.s1} strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="Snowball" stroke={c.s2} strokeWidth={2} dot={false} strokeDasharray="5 3" isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

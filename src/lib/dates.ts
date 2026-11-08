// Date helpers working on local calendar dates ('YYYY-MM-DD'), never times,
// so results do not shift with time zones.
import type { Frequency, ISODate } from './types';

const pad = (n: number) => String(n).padStart(2, '0');

export function toISO(d: Date): ISODate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseISO(s: ISODate): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12); // noon avoids DST edge cases
}

export const todayISO = (): ISODate => toISO(new Date());

export function addDays(s: ISODate, days: number): ISODate {
  const d = parseISO(s);
  d.setDate(d.getDate() + days);
  return toISO(d);
}

export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/** Add months keeping the "intended" day, clamped to month length (31 Jan + 1m = 28/29 Feb). */
export function addMonthsClamped(s: ISODate, months: number, intendedDay?: number): ISODate {
  const d = parseISO(s);
  const day = intendedDay ?? d.getDate();
  const target = new Date(d.getFullYear(), d.getMonth() + months, 1, 12);
  target.setDate(Math.min(day, daysInMonth(target.getFullYear(), target.getMonth())));
  return toISO(target);
}

export function diffDays(from: ISODate, to: ISODate): number {
  return Math.round((parseISO(to).getTime() - parseISO(from).getTime()) / 86_400_000);
}

export const monthKey = (s: ISODate): string => s.slice(0, 7);

export function monthStart(s: ISODate): ISODate {
  return `${s.slice(0, 7)}-01`;
}

export function monthEnd(s: ISODate): ISODate {
  const d = parseISO(s);
  return toISO(new Date(d.getFullYear(), d.getMonth() + 1, 0, 12));
}

export function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1, 12);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

/** All occurrence dates of a schedule within [from, to] inclusive. */
export function occurrences(startDate: ISODate, frequency: Frequency, from: ISODate, to: ISODate, limit = 400): ISODate[] {
  const out: ISODate[] = [];
  if (to < from) return out;
  if (frequency === 'once') {
    if (startDate >= from && startDate <= to) out.push(startDate);
    return out;
  }
  if (frequency === 'weekly' || frequency === 'biweekly') {
    const step = frequency === 'weekly' ? 7 : 14;
    let cur = startDate;
    if (cur < from) {
      const jumps = Math.floor(diffDays(cur, from) / step);
      cur = addDays(cur, jumps * step);
      if (cur < from) cur = addDays(cur, step);
    }
    while (cur <= to && out.length < limit) {
      out.push(cur);
      cur = addDays(cur, step);
    }
    return out;
  }
  const months = frequency === 'monthly' ? 1 : 12;
  const day = parseISO(startDate).getDate();
  let i = 0;
  let cur = startDate;
  if (cur < from) {
    // jump close to `from` quickly
    const s = parseISO(startDate);
    const f = parseISO(from);
    const monthsBetween = (f.getFullYear() - s.getFullYear()) * 12 + (f.getMonth() - s.getMonth());
    i = Math.max(0, Math.floor(monthsBetween / months) - 1);
    cur = addMonthsClamped(startDate, i * months, day);
  }
  while (cur <= to && out.length < limit) {
    if (cur >= from) out.push(cur);
    i += 1;
    cur = addMonthsClamped(startDate, i * months, day);
  }
  return out;
}

/** How many times per month a frequency occurs, on average (for monthly plans). */
export function monthlyFactor(f: Frequency): number {
  switch (f) {
    case 'weekly':
      return 52 / 12;
    case 'biweekly':
      return 26 / 12;
    case 'monthly':
      return 1;
    case 'yearly':
      return 1 / 12;
    case 'once':
      return 0;
  }
}

export function formatDate(s: ISODate, style: 'short' | 'long' = 'short'): string {
  const d = parseISO(s);
  return d.toLocaleDateString('en-GB', style === 'short' ? { day: 'numeric', month: 'short' } : { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

export function relativeDay(s: ISODate, today: ISODate = todayISO()): string {
  const n = diffDays(today, s);
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n === -1) return 'yesterday';
  if (n < 0) return `${-n} days ago`;
  if (n < 7) return `in ${n} days`;
  return formatDate(s);
}

export function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}

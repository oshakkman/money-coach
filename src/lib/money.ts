// Money helpers. Arithmetic is done on integer thousandths (fils for JOD) so
// that sums never drift because of floating-point rounding.

const SCALE = 1000;

export const toMinor = (n: number): number => Math.round((Number(n) || 0) * SCALE);
export const fromMinor = (n: number): number => n / SCALE;
export const round = (n: number): number => fromMinor(toMinor(n));

export function sum(values: number[]): number {
  let total = 0;
  for (const v of values) total += toMinor(v);
  return fromMinor(total);
}

export const add = (...values: number[]): number => sum(values);
export const sub = (a: number, b: number): number => fromMinor(toMinor(a) - toMinor(b));

const DECIMALS: Record<string, number> = { JOD: 3, KWD: 3, BHD: 3, OMR: 3, TND: 3, JPY: 0 };
export const currencyDecimals = (currency: string): number => DECIMALS[currency] ?? 2;

/**
 * Display format. Calculations keep exact fils (3 decimals); display shows at
 * most 2 decimals and drops ".00" for whole amounts: 30 JOD, 12.50 JOD, 801.57 JOD.
 */
export function formatMoney(amount: number, currency: string, opts: { compact?: boolean; sign?: boolean } = {}): string {
  const decimals = Math.min(2, currencyDecimals(currency));
  const abs = Math.abs(round(amount));
  const shown = Math.round(abs * 10 ** decimals) / 10 ** decimals;
  const prefix = shown !== 0 && amount < 0 ? '−' : opts.sign && amount > 0 ? '+' : '';
  if (opts.compact && abs >= 10000) {
    const s = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(abs);
    return `${prefix}${s} ${currency}`;
  }
  const minDigits = Number.isInteger(shown) ? 0 : decimals;
  const s = new Intl.NumberFormat('en', { minimumFractionDigits: minDigits, maximumFractionDigits: decimals }).format(shown);
  return `${prefix}${s} ${currency}`;
}

/** Daily/weekly allowance: rounded DOWN to 0.01 so it never overstates what is safe. */
export function allowance(total: number, days: number): number {
  if (total <= 0 || days <= 0) return 0;
  return Math.floor((total / days) * 100 + 1e-9) / 100;
}

/** Parse user-typed amounts like "1,250.5" or "30 JOD". Returns NaN when invalid. */
export function parseAmount(input: string): number {
  const cleaned = String(input).replace(/[^\d.,-]/g, '').replace(/,/g, '');
  if (!cleaned) return NaN;
  const n = Number(cleaned);
  return Number.isFinite(n) ? round(n) : NaN;
}

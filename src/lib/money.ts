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

export function formatMoney(amount: number, currency: string, opts: { compact?: boolean; sign?: boolean } = {}): string {
  const decimals = currencyDecimals(currency);
  const abs = Math.abs(amount);
  // Hide trailing zero fils for readability: 30.000 JOD -> 30 JOD, 12.500 -> 12.50
  let minDigits = decimals;
  if (decimals === 3) minDigits = Number.isInteger(round(abs)) ? 0 : 2;
  if (opts.compact && abs >= 10000) {
    const s = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(abs);
    return `${amount < 0 ? '−' : opts.sign ? '+' : ''}${s} ${currency}`;
  }
  const s = new Intl.NumberFormat('en', {
    minimumFractionDigits: minDigits,
    maximumFractionDigits: decimals,
  }).format(abs);
  const prefix = amount < 0 && toMinor(amount) !== 0 ? '−' : opts.sign && amount > 0 ? '+' : '';
  return `${prefix}${s} ${currency}`;
}

/** Parse user-typed amounts like "1,250.5" or "30 JOD". Returns NaN when invalid. */
export function parseAmount(input: string): number {
  const cleaned = String(input).replace(/[^\d.,-]/g, '').replace(/,/g, '');
  if (!cleaned) return NaN;
  const n = Number(cleaned);
  return Number.isFinite(n) ? round(n) : NaN;
}

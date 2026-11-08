// Independent check of AI answers: every money figure Claude writes must be
// traceable to a figure the app calculated (or a simple sum/difference of two).
import type { RafiqResponse } from '../types';

export function collectNumbers(value: unknown, out: number[] = []): number[] {
  if (typeof value === 'number' && Number.isFinite(value)) out.push(value);
  else if (typeof value === 'string') {
    const re = /-?\d{1,3}(?:,\d{3})+(?:\.\d+)?|-?\d+(?:\.\d+)?/g;
    for (const m of value.match(re) ?? []) out.push(Number(m.replace(/,/g, '')));
  } else if (Array.isArray(value)) value.forEach((v) => collectNumbers(v, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => collectNumbers(v, out));
  return out;
}

function responseTexts(r: RafiqResponse): string[] {
  return [
    r.headline,
    r.situation,
    r.recommendation,
    ...r.constraints,
    ...r.impact,
    ...r.steps.flatMap((s) => [s.title, s.detail ?? '', s.amount !== undefined ? String(s.amount) : '']),
    r.followUp.question,
  ];
}

/** Returns money figures in the AI response that do not match the app's own numbers. */
export function findUnverifiedFigures(ai: RafiqResponse, known: number[]): string[] {
  const set = [...new Set(known.map((k) => Math.abs(Math.round(k * 1000) / 1000)))].filter((k) => k !== 0);
  const matches = (n: number) => {
    const tol = (k: number) => Math.max(0.006, Number.isInteger(n) ? 0.5 : 0.006) + (k > 1000 ? 0.5 : 0);
    if (set.some((k) => Math.abs(k - n) <= tol(k))) return true;
    for (let i = 0; i < set.length; i++) {
      for (let j = i; j < set.length; j++) {
        const a = set[i];
        const b = set[j];
        if (Math.abs(a + b - n) <= 0.51 || Math.abs(Math.abs(a - b) - n) <= 0.51) return true;
        if (b >= 1 && b <= 31 && Number.isInteger(b) && Math.abs(a / b - n) <= 0.51) return true;
        if (a >= 1 && a <= 31 && Number.isInteger(a) && Math.abs(b / a - n) <= 0.51) return true;
      }
    }
    return false;
  };
  const bad = new Set<string>();
  for (const text of responseTexts(ai)) {
    const re = /(-?\d{1,3}(?:,\d{3})+(?:\.\d+)?|-?\d+(?:\.\d+)?)(\s*%|\s*(?:days?|weeks?|months?|years?))?/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      if (m[2]) continue; // percentages and durations are not money figures
      const n = Math.abs(Number(m[1].replace(/,/g, '')));
      if (!Number.isFinite(n)) continue;
      if (Number.isInteger(n) && (n <= 31 || (n >= 1990 && n <= 2100))) continue; // days, dates, years
      if (!matches(n)) bad.add(m[1]);
    }
  }
  return [...bad];
}

// Turns ordinary language into structured facts: intent, amounts, days, named debt.
import type { DataSet } from '../types';

export type Intent = 'salary' | 'debt' | 'unexpected' | 'overspent' | 'afford' | 'lowcash' | 'savings' | 'status';

const WORD_NUMBERS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19, twenty: 20, 'twenty-one': 21, 'twenty one': 21, thirty: 30,
};

export interface Parsed {
  intent: Intent;
  amounts: number[];
  /** The main amount in the message (first money amount). */
  amount?: number;
  days?: number;
  debtId?: string;
  essentialHint: boolean;
  text: string;
}

export function parseDays(text: string): number | undefined {
  const t = text.toLowerCase();
  const m = t.match(/(\d{1,3})\s*(?:more\s+)?days?\b/);
  if (m) return Number(m[1]);
  const w = t.match(/\b(twenty[- ]one|thirty|twenty|nineteen|eighteen|seventeen|sixteen|fifteen|fourteen|thirteen|twelve|eleven|ten|nine|eight|seven|six|five|four|three|two|one|a)\s+(?:more\s+)?days?\b/);
  if (w) return WORD_NUMBERS[w[1]];
  const wk = t.match(/(\d{1,2}|one|two|three|four|a)\s+weeks?\b/);
  if (wk) return (Number(wk[1]) || WORD_NUMBERS[wk[1]] || 1) * 7;
  if (/\bnext week\b/.test(t)) return 7;
  if (/\btomorrow\b/.test(t)) return 1;
  return undefined;
}

export function parseAmounts(text: string): number[] {
  const out: number[] = [];
  // numbers not followed by a time/percent unit
  const re = /(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?(?!\d|[.,]\d)\s*(k\b)?(?!\s*(?:%|percent|days?|weeks?|months?|years?|yrs?|times|th\b|st\b|nd\b|rd\b))/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const before = text.slice(Math.max(0, m.index - 1), m.index);
    if (/[\d.]/.test(before)) continue;
    let n = Number((m[1] + (m[2] ?? '')).replace(/,/g, ''));
    if (m[3]) n *= 1000;
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

export function detectIntent(text: string): Intent {
  const t = text.toLowerCase();
  if (/(received|got|get|just got|receiving|came in|arrived|deposited).{0,20}(salary|paycheck|pay ?cheque|wage|paid)|\bi got paid\b|\bpayday (is )?today\b|salary (came|arrived|is in|landed)/.test(t))
    return 'salary';
  if (/(pay ?off|clear|kill|finish|faster|sooner|quicker|early|extra).{0,40}(debt|loan|card|balance|owe)|(debt|loan|card).{0,40}(faster|sooner|quicker|early|extra|pay ?off)|snowball|avalanche/.test(t))
    return 'debt';
  if (/unexpected|emergency|broke down|broken|surprise|urgent|rework|hospital|doctor|repair|fine\b|accident|had to pay|need to pay/.test(t)) return 'unexpected';
  if (/overspen|over ?spend|over budget|over my budget|blew|went over|spent too much|recover/.test(t)) return 'overspent';
  if (/afford|\bbuy\b|purchase|should i (get|buy|spend|order)|spend .{0,20}on|worth it|treat myself|want to get/.test(t)) return 'afford';
  if (/\bleft\b|until payday|till payday|to payday|before payday|remaining|days until|days till|days left|how much can i spend|daily/.test(t)) return 'lowcash';
  if (/sav(e|ing)|goal|emergency fund|put aside/.test(t)) return 'savings';
  return 'status';
}

export function parseMessage(text: string, data: DataSet): Parsed {
  const intent = detectIntent(text);
  const amounts = parseAmounts(text);
  const days = parseDays(text);
  const t = text.toLowerCase();
  const debt = data.debts
    .filter((d) => !d.closedAt)
    .find((d) => t.includes(d.name.toLowerCase()) || d.name.toLowerCase().split(/\s+/).some((w) => w.length > 3 && t.includes(w)));
  // Drop the "days" number from amounts when it was written without a unit nearby.
  const filtered = days !== undefined ? amounts.filter((a, i) => !(a === days && i > 0)) : amounts;
  return {
    intent,
    amounts: filtered,
    amount: filtered[0],
    days,
    debtId: debt?.id,
    essentialHint: /medicine|medical|rent|school|fees|doctor|hospital|repair|electric|water|bill|car|tyre|tire|need\b/.test(t),
    text,
  };
}

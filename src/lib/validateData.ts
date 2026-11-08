// Structural validation of a full data set. Used when loading from storage and
// before importing a backup, so damaged data is caught before it is used.
import { STORE_NAMES, type DataSet } from './types';

const isDate = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isNum = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown) => typeof v === 'string';

type Rule = (r: Record<string, unknown>) => string | null;

const rules: Record<string, Rule> = {
  accounts: (r) => (!isStr(r.id) || !isStr(r.name) || !isNum(r.openingBalance) || !isDate(r.openingDate) ? 'invalid account' : null),
  transactions: (r) =>
    !isStr(r.id) || !isDate(r.date) || !isNum(r.amount) || (r.amount as number) < 0 || !['income', 'expense', 'transfer'].includes(r.type as string) || !isStr(r.accountId)
      ? 'invalid transaction'
      : null,
  recurring: (r) => (!isStr(r.id) || !isStr(r.name) || !isNum(r.amount) || !isDate(r.startDate) || !['income', 'expense'].includes(r.kind as string) ? 'invalid bill/income item' : null),
  debts: (r) => (!isStr(r.id) || !isStr(r.name) || !isNum(r.balance) || !isNum(r.apr) || !isNum(r.minPayment) || !isNum(r.dueDay) ? 'invalid debt' : null),
  goals: (r) => (!isStr(r.id) || !isStr(r.name) || !isNum(r.target) || !isNum(r.saved) ? 'invalid goal' : null),
  budgets: (r) => (!isStr(r.category) || !isNum(r.monthlyLimit) ? 'invalid budget' : null),
  actions: (r) => (!isStr(r.id) || !isStr(r.title) || !isDate(r.dueDate) ? 'invalid action' : null),
  conversations: (r) => (!isStr(r.id) || !Array.isArray(r.messages) ? 'invalid conversation' : null),
};

export function validateDataSet(data: unknown): string[] {
  const problems: string[] = [];
  if (!data || typeof data !== 'object') return ['Data is not an object'];
  const d = data as Record<string, unknown>;
  const s = d.settings as Record<string, unknown> | undefined;
  if (!s || typeof s !== 'object' || !isStr(s.currency)) problems.push('Settings are missing or invalid');
  for (const name of STORE_NAMES) {
    const list = d[name];
    if (!Array.isArray(list)) {
      problems.push(`${name} is not a list`);
      continue;
    }
    list.forEach((item, i) => {
      if (!item || typeof item !== 'object') problems.push(`${name}[${i}] is not a record`);
      else {
        const p = rules[name]((item as Record<string, unknown>));
        if (p) problems.push(`${name}[${i}]: ${p}`);
      }
    });
  }
  return problems;
}

export function isDataSet(data: unknown): data is DataSet {
  return validateDataSet(data).length === 0;
}

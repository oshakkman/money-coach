// Realistic TEST-ONLY data (fictional). Never used by the app itself.
import { DEFAULT_SETTINGS, type DataSet, type Transaction } from '../src/lib/types';

let n = 0;
export const id = () => `t${++n}`;
const now = '2026-11-01T09:00:00.000Z';

export function tx(p: Partial<Transaction> & Pick<Transaction, 'date' | 'type' | 'amount' | 'category'>): Transaction {
  return { id: id(), accountId: 'bank', createdAt: now, updatedAt: now, ...p };
}

/** Salary 900 JOD on the 25th; rent 300 on the 1st; today = 2026-11-16. */
export function scenario(): DataSet {
  return {
    settings: { ...DEFAULT_SETTINGS, welcomeDone: true },
    accounts: [
      { id: 'bank', name: 'Bank', type: 'bank', openingBalance: 400, openingDate: '2026-11-01', createdAt: now },
      { id: 'cash', name: 'Cash', type: 'cash', openingBalance: 50, openingDate: '2026-11-01', createdAt: now },
      { id: 'sav', name: 'Savings', type: 'savings', openingBalance: 600, openingDate: '2026-11-01', createdAt: now },
    ],
    transactions: [
      tx({ date: '2026-11-03', type: 'expense', amount: 60, category: 'Groceries' }),
      tx({ date: '2026-11-05', type: 'expense', amount: 25.5, category: 'Eating out', accountId: 'cash' }),
      tx({ date: '2026-11-08', type: 'expense', amount: 40, category: 'Eating out' }),
      tx({ date: '2026-11-10', type: 'expense', amount: 20, category: 'Fuel' }),
      tx({ date: '2026-10-31', type: 'expense', amount: 999, category: 'Shopping' }), // before opening date: ignored
    ],
    recurring: [
      { id: 'salary', name: 'Salary', kind: 'income', amount: 900, category: 'Salary', frequency: 'monthly', startDate: '2026-10-25', essential: true, active: true, settledThrough: '2026-10-25', createdAt: now },
      { id: 'rent', name: 'Rent', kind: 'expense', amount: 300, category: 'Housing', frequency: 'monthly', startDate: '2026-11-01', essential: true, active: true, settledThrough: '2026-11-01', createdAt: now },
      { id: 'elec', name: 'Electricity', kind: 'expense', amount: 35, category: 'Utilities', frequency: 'monthly', startDate: '2026-10-20', essential: true, active: true, settledThrough: '2026-10-20', createdAt: now },
      { id: 'gym', name: 'Gym', kind: 'expense', amount: 25, category: 'Entertainment', frequency: 'monthly', startDate: '2026-10-22', essential: false, active: true, settledThrough: '2026-10-22', createdAt: now },
    ],
    debts: [
      { id: 'card', name: 'Credit card', originalBalance: 1200, balance: 1000, apr: 24, minPayment: 50, dueDay: 18, createdAt: '2026-11-01T09:00:00.000Z', settledThrough: '2026-11-01' },
      { id: 'loan', name: 'Car loan', originalBalance: 3000, balance: 2400, apr: 8, minPayment: 120, dueDay: 28, createdAt: '2026-11-01T09:00:00.000Z' },
    ],
    goals: [{ id: 'ef', name: 'Emergency fund', target: 2000, saved: 600, monthlyContribution: 50, priority: 'high', createdAt: now }],
    budgets: [
      { category: 'Eating out', monthlyLimit: 50 },
      { category: 'Groceries', monthlyLimit: 150 },
    ],
    actions: [],
    conversations: [],
  };
}

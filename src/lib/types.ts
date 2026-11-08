// Core data model. All amounts are stored in major units (e.g. 12.345 JOD) and
// always rounded with the helpers in money.ts before storage or comparison.

export type ISODate = string; // 'YYYY-MM-DD'

export type AccountType = 'cash' | 'bank' | 'wallet' | 'savings';

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  /** Balance on openingDate, before any transactions recorded in Rafiq. */
  openingBalance: number;
  openingDate: ISODate;
  archived?: boolean;
  createdAt: string;
}

export type TxType = 'income' | 'expense' | 'transfer';

export interface Transaction {
  id: string;
  date: ISODate;
  type: TxType;
  /** Always positive. Direction comes from `type`. */
  amount: number;
  category: string;
  accountId: string;
  /** Destination account for transfers. */
  toAccountId?: string;
  note?: string;
  /** Set when the transaction pays a recurring item / commitment. */
  recurringId?: string;
  /** Set when the transaction is a debt repayment. */
  debtId?: string;
  /** Set when the transaction is a savings-goal contribution. */
  goalId?: string;
  createdAt: string;
  updatedAt: string;
}

export type Frequency = 'once' | 'weekly' | 'biweekly' | 'monthly' | 'yearly';

/** Regular income, regular expenses (bills) and one-off expected commitments. */
export interface Recurring {
  id: string;
  name: string;
  kind: 'income' | 'expense';
  amount: number;
  category: string;
  frequency: Frequency;
  /** First (or only, for 'once') due date. Later dates are derived from it. */
  startDate: ISODate;
  /** Essential = must be paid (rent, utilities). Discretionary otherwise. */
  essential: boolean;
  accountId?: string;
  /** Occurrences on or before this date are settled (paid / received). */
  settledThrough?: ISODate;
  active: boolean;
  createdAt: string;
}

export interface Debt {
  id: string;
  name: string;
  /** Balance when first recorded (for progress). */
  originalBalance: number;
  /** Current outstanding balance. */
  balance: number;
  /** Annual interest rate in percent, e.g. 18 for 18%. */
  apr: number;
  minPayment: number;
  /** Day of month the payment is due (1-31). */
  dueDay: number;
  settledThrough?: ISODate;
  createdAt: string;
  closedAt?: string;
}

export interface Goal {
  id: string;
  name: string;
  target: number;
  saved: number;
  targetDate?: ISODate;
  /** Planned contribution per month (used for safe-to-spend). */
  monthlyContribution: number;
  priority: 'high' | 'normal';
  createdAt: string;
  completedAt?: string;
}

export interface Budget {
  /** Category name (unique). */
  category: string;
  monthlyLimit: number;
}

export type ActionStatus = 'open' | 'done' | 'skipped';

/** An accountability action: something Rafiq asked you to do and will check on. */
export interface ActionItem {
  id: string;
  title: string;
  detail?: string;
  amount?: number;
  dueDate: ISODate;
  status: ActionStatus;
  source: 'rafiq' | 'dashboard' | 'manual';
  conversationId?: string;
  createdAt: string;
  completedAt?: string;
}

export interface RafiqStep {
  title: string;
  detail?: string;
  amount?: number;
}

/** The fixed six-part structure every Rafiq answer follows. */
export interface RafiqResponse {
  verdict?: 'yes' | 'no' | 'caution' | 'info';
  headline: string;
  situation: string;
  constraints: string[];
  recommendation: string;
  steps: RafiqStep[];
  impact: string[];
  followUp: { question: string; inDays: number };
  questions?: string[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'rafiq';
  text?: string;
  response?: RafiqResponse;
  engine?: 'offline' | 'claude';
  /** Figures in an AI answer that could not be matched to your records. */
  unverified?: string[];
  /** Why Claude was not used for this answer (shown to the user). */
  aiNote?: string;
  /** True once the user turned this answer's steps into tracked actions. */
  committed?: boolean;
  createdAt: string;
}

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface Settings {
  id: 'settings';
  currency: string;
  /** Safety buffer kept out of safe-to-spend. */
  buffer: number;
  /** Fallback payday (day of month) if no recurring income is recorded. */
  fallbackPayday?: number;
  onboardingDismissed: boolean;
  welcomeDone: boolean;
  lastBackupAt?: string;
  backupReminderSnoozedUntil?: string;
  aiConsent: boolean;
  /** Stored on this device only, sent only to your own Rafiq server. */
  aiAccessCode?: string;
  useAiByDefault: boolean;
  theme: 'system' | 'light' | 'dark';
}

export interface DataSet {
  settings: Settings;
  accounts: Account[];
  transactions: Transaction[];
  recurring: Recurring[];
  debts: Debt[];
  goals: Goal[];
  budgets: Budget[];
  actions: ActionItem[];
  conversations: Conversation[];
}

export const STORE_NAMES = [
  'accounts',
  'transactions',
  'recurring',
  'debts',
  'goals',
  'budgets',
  'actions',
  'conversations',
] as const;
export type StoreName = (typeof STORE_NAMES)[number];

export const DEFAULT_SETTINGS: Settings = {
  id: 'settings',
  currency: 'JOD',
  buffer: 0,
  onboardingDismissed: false,
  welcomeDone: false,
  aiConsent: false,
  useAiByDefault: false,
  theme: 'system',
};

export const EXPENSE_CATEGORIES = [
  'Housing',
  'Utilities',
  'Groceries',
  'Transport',
  'Fuel',
  'Phone & internet',
  'Eating out',
  'Health',
  'Education',
  'Family support',
  'Subscriptions',
  'Shopping',
  'Entertainment',
  'Personal care',
  'Gifts & charity',
  'Debt payment',
  'Savings',
  'Fees & charges',
  'Other',
];

export const INCOME_CATEGORIES = ['Salary', 'Freelance', 'Bonus', 'Gift', 'Refund', 'Other income'];

/** Categories treated as essential by default when no recurring item says otherwise. */
export const ESSENTIAL_CATEGORIES = new Set([
  'Housing',
  'Utilities',
  'Groceries',
  'Transport',
  'Fuel',
  'Phone & internet',
  'Health',
  'Education',
  'Debt payment',
  'Family support',
]);

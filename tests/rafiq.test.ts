import { describe, expect, it } from 'vitest';
import { runEngine } from '../src/lib/rafiq/engine';
import { detectIntent, parseAmounts, parseDays } from '../src/lib/rafiq/parse';
import { findUnverifiedFigures, collectNumbers } from '../src/lib/rafiq/validate';
import { buildSnapshot } from '../src/lib/rafiq/snapshot';
import { nextActions } from '../src/lib/nextAction';
import { scenario } from './fixtures';
import type { RafiqResponse } from '../src/lib/types';

const TODAY = '2026-11-16';

describe('parsing', () => {
  it('detects intents from the example prompts', () => {
    expect(detectIntent('I have 30 JOD left and nine days until payday.')).toBe('lowcash');
    expect(detectIntent('I want to purchase something for 50 JOD. Can I afford it?')).toBe('afford');
    expect(detectIntent('I overspent this month. Help me recover.')).toBe('overspent');
    expect(detectIntent('I received my salary. What should I prioritise?')).toBe('salary');
    expect(detectIntent('I have an unexpected expense. Rework my financial plan.')).toBe('unexpected');
    expect(detectIntent('I want to pay off this particular debt faster.')).toBe('debt');
  });
  it('reads amounts and days, including words', () => {
    expect(parseAmounts('I have 30 JOD left and nine days until payday')).toEqual([30]);
    expect(parseDays('nine days until payday')).toBe(9);
    expect(parseAmounts('spent 1,250.50 on rent and 12 days left')).toEqual([1250.5]);
    expect(parseAmounts('a 2k laptop')).toEqual([2000]);
  });
});

describe('engine answers use the actual records', () => {
  const d = scenario();
  const check = (r: RafiqResponse) => {
    expect(r.situation.length).toBeGreaterThan(0);
    expect(r.recommendation.length).toBeGreaterThan(0);
    expect(r.steps.length).toBeGreaterThan(0);
    expect(r.followUp.inDays).toBeGreaterThanOrEqual(1);
  };

  it('low cash: flags mismatch with records and computes daily limit', () => {
    const { response: r } = runEngine('I have 30 JOD left and nine days until payday.', d, TODAY);
    check(r);
    expect(r.constraints.join(' ')).toContain('304.50 JOD'); // recorded balance mentioned
    expect(r.verdict).toBe('no'); // 30 - 110 bills = shortfall
    expect(r.headline).toContain('80 JOD short');
  });

  it('affordability: 50 JOD fits but challenges because of tight daily allowance', () => {
    const { response: r } = runEngine('I want to purchase something for 50 JOD. Can I afford it?', d, TODAY);
    check(r);
    // safe 144.5 -> 94.5 ; per day 10.5 ; recent daily ~ 6.55*? -> verdict yes or caution, never "no"
    expect(['yes', 'caution']).toContain(r.verdict);
    expect(r.impact.join(' ')).toContain('94.50 JOD');
  });

  it('affordability: 500 JOD is refused with a reason', () => {
    const { response: r } = runEngine('Can I afford a 500 JOD phone?', d, TODAY);
    expect(r.verdict).toBe('no');
    expect(r.headline).toContain('355.50 JOD short');
  });

  it('affordability: asks for price when missing', () => {
    const { response: r } = runEngine('Can I afford new shoes?', d, TODAY);
    expect(r.questions?.length).toBeGreaterThan(0);
  });

  it('overdue bill blocks optional purchases', () => {
    const d2 = scenario();
    d2.recurring.find((x) => x.id === 'elec')!.settledThrough = '2026-09-20';
    const { response: r } = runEngine('Can I afford a 20 JOD dinner?', d2, TODAY);
    expect(r.verdict).toBe('no');
    expect(r.recommendation).toContain('Electricity');
  });

  it('overspent: names the over-budget category', () => {
    const { response: r } = runEngine('I overspent this month. Help me recover.', d, TODAY);
    check(r);
    expect(r.steps[0].title).toContain('Eating out');
  });

  it('salary: allocates bills first, then savings and debt', () => {
    const { response: r } = runEngine('I received my salary. What should I prioritise?', d, TODAY);
    check(r);
    expect(r.situation).toContain('900 JOD');
    const titles = r.steps.map((s) => s.title).join(' | ');
    expect(titles.indexOf('essential')).toBeLessThan(titles.indexOf('savings'));
  });

  it('unexpected expense: funds it in a safe order', () => {
    const { response: r } = runEngine('Unexpected car repair of 200 JOD. Rework my plan.', d, TODAY);
    check(r);
    expect(r.recommendation).toContain('safe-to-spend');
    expect(r.steps.some((s) => /savings/i.test(s.title))).toBe(true);
  });

  it('debt: targets the named debt and challenges if a higher-rate debt exists', () => {
    const { response: r } = runEngine('I want to pay off my car loan faster with 100 extra', d, TODAY);
    check(r);
    expect(r.headline).toContain('Car loan');
    expect(r.constraints.join(' ')).toContain('Credit card charges more interest');
  });

  it('status: summarises position', () => {
    const { response: r } = runEngine('Where do I stand?', d, TODAY);
    expect(r.headline).toContain('144.50 JOD');
  });

  it('no data: asks for basics instead of guessing', () => {
    const empty = { ...scenario(), accounts: [], transactions: [] };
    const { response: r } = runEngine('Can I afford 10?', empty, TODAY);
    expect(r.headline).toContain('starting numbers');
  });
});

describe('AI figure validation', () => {
  it('accepts figures from the snapshot and flags invented ones', () => {
    const d = scenario();
    const snap = buildSnapshot(d, TODAY);
    const engine = runEngine('Can I afford 50?', d, TODAY).response;
    const known = [...collectNumbers(snap), ...collectNumbers(engine), 50];
    const ai: RafiqResponse = {
      verdict: 'caution',
      headline: 'Yes, but carefully',
      situation: 'You can safely spend 144.50 JOD for 9 days.',
      constraints: ['Bills before payday: 110 JOD.'],
      recommendation: 'After buying you have 94.50 JOD left.',
      steps: [{ title: 'Keep 35 JOD for electricity' }],
      impact: ['You will save 777.77 JOD of interest.'],
      followUp: { question: 'Did you?', inDays: 3 },
    };
    expect(findUnverifiedFigures(ai, known)).toEqual(['777.77']);
  });
});

describe('next action', () => {
  it('prioritises overdue bills', () => {
    const d = scenario();
    d.recurring.find((x) => x.id === 'elec')!.settledThrough = '2026-09-20';
    expect(nextActions(d, TODAY)[0].tone).toBe('critical');
  });
  it('asks for a balance first when empty', () => {
    const d = { ...scenario(), accounts: [] };
    expect(nextActions(d, TODAY)[0].id).toBe('setup-balance');
  });
});

// End-to-end acceptance test in a real browser (Chromium via Playwright).
// Run after `npm run build`:  npm run test:e2e
// Uses only fictional test data in a throwaway browser profile.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');
const PORT = 4179;
const BASE = `http://localhost:${PORT}`;
const OUT = process.env.E2E_OUT || 'screenshots';
mkdirSync(OUT, { recursive: true });
const FAKE_KEY = 'sk-ant-e2e-fake-key-do-not-use';
const CODE = 'e2e-access-code-123';

let failures = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!cond) failures++;
};

const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'], {
  env: { ...process.env, ANTHROPIC_API_KEY: FAKE_KEY, RAFIQ_ACCESS_CODE: CODE },
  stdio: 'pipe',
});
await new Promise((resolve, reject) => {
  server.stdout.on('data', (d) => String(d).includes('localhost') && resolve());
  server.on('exit', () => reject(new Error('preview server exited')));
  setTimeout(() => reject(new Error('preview server timeout')), 20000);
});

const browser = await chromium.launch();
let page;
try {
  // ------------------------------------------------------------ desktop flow
  // A persistent profile lets us really close the browser and reopen it.
  const profile = mkdtempSync(join(tmpdir(), 'rafiq-e2e-'));
  const ctxOpts = { viewport: { width: 1360, height: 900 }, acceptDownloads: true };
  let ctx = await chromium.launchPersistentContext(profile, ctxOpts);
  page = ctx.pages()[0] ?? (await ctx.newPage());
  const errors = [];
  const wire = (p) => {
    p.on('dialog', (d) => d.accept());
    p.on('pageerror', (e) => errors.push(e.message));
  };
  wire(page);
  const visible = (loc) => loc.waitFor({ timeout: 8000 }).then(() => true, () => false);

  await page.goto(BASE);
  await page.getByRole('button', { name: /Start — add my current balance/ }).click();
  await page.getByLabel('Name').fill('Bank');
  await page.getByLabel(/Balance \(JOD\)/).fill('500');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByText('Account saved').waitFor();

  // income: salary in 10 days
  const d = new Date();
  d.setDate(d.getDate() + 10);
  const payday = d.toISOString().slice(0, 10);
  await page.getByRole('button', { name: /Income and payday/ }).click();
  await page.getByLabel('Name').fill('Salary');
  await page.getByLabel(/Amount \(JOD\)/).fill('900');
  await page.getByLabel(/Next or last payday/).fill(payday);
  await page.getByRole('button', { name: 'Save', exact: true }).click();

  // a bill due in 3 days
  const b = new Date();
  b.setDate(b.getDate() + 3);
  await page.getByRole('button', { name: /Regular expenses/ }).click();
  await page.getByLabel('Name').fill('Electricity');
  await page.getByLabel(/Amount \(JOD\)/).fill('40');
  await page.getByLabel(/due date/i).fill(b.toISOString().slice(0, 10));
  await page.getByRole('button', { name: 'Save', exact: true }).click();

  // an expense
  await page.getByRole('button', { name: 'Add spending' }).click();
  await page.getByLabel(/Amount \(JOD\)/).fill('25');
  await page.getByLabel('Note (optional)').fill('E2E groceries');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[data-testid=available]')?.textContent?.includes('475'));

  const safe = await page.getByTestId('safe-to-spend').innerText();
  ok(safe.replace(/\s/g, '').startsWith('435'), `safe-to-spend = 500 - 25 - 40 = 435 (got "${safe.replace(/\n/g, ' ')}")`);
  ok((await page.getByTestId('available').innerText()).includes('475'), 'available balance = 475');
  await page.screenshot({ path: join(OUT, 'desktop-dashboard.png') });

  // persistence: close the whole browser, reopen with the same profile
  await ctx.close();
  ctx = await chromium.launchPersistentContext(profile, ctxOpts);
  page = ctx.pages()[0] ?? (await ctx.newPage());
  wire(page);
  await page.goto(`${BASE}/#/transactions`);
  ok(await visible(page.getByText('E2E groceries')), 'transaction survives closing and reopening the browser');
  await page.screenshot({ path: join(OUT, 'desktop-transactions.png') });

  // Rafiq scenario uses actual records
  await page.goto(`${BASE}/#/rafiq`);
  await page.getByLabel('Describe your situation').fill('I want to buy something for 50 JOD. Can I afford it?');
  await page.getByRole('button', { name: 'Send' }).click();
  const answer = page.getByTestId('rafiq-answer').last();
  await answer.waitFor();
  const answerText = await answer.innerText();
  ok(/435/.test(answerText) && /385/.test(answerText), 'Rafiq affordability answer uses recorded safe-to-spend (435 → 385)');
  await page.getByRole('button', { name: 'Commit to this plan' }).click();
  await page.getByText(/Added \d+ actions/).waitFor();
  ok(await page.getByRole('heading', { name: 'Commitments' }).isVisible(), 'committing creates tracked actions');
  await page.screenshot({ path: join(OUT, 'desktop-rafiq.png') });

  // Claude connection: code check and graceful fallback (fake key => Anthropic rejects)
  await page.goto(`${BASE}/#/settings`);
  await page.getByLabel('Access code').fill('wrong-code-000000');
  await page.getByRole('button', { name: /Test & save/ }).click();
  await page.getByText(/access code is wrong/).waitFor({ timeout: 5000 });
  ok(true, 'wrong access code is rejected');
  await page.getByLabel('Access code').fill(CODE);
  await page.getByRole('button', { name: /Test & save/ }).click();
  await page.getByText(/Connected ✓/).waitFor({ timeout: 5000 });
  ok(true, 'correct access code connects');
  await page.goto(`${BASE}/#/rafiq`);
  await page.getByTestId('ai-toggle').click(); // shows the data-sharing consent prompt first
  await page.waitForFunction(() => document.querySelector('[data-testid=ai-toggle]')?.checked);
  await page.getByLabel('Describe your situation').fill('Where do I stand?');
  await page.getByRole('button', { name: 'Send' }).click();
  await page.getByText(/Claude unavailable/).waitFor({ timeout: 70000 });
  ok(true, 'when Claude fails, Rafiq falls back to the offline engine and says so');

  // offline: wait for service worker, then cut the network
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForTimeout(1500);
  await ctx.setOffline(true);
  await page.goto(`${BASE}/#/transactions`);
  ok(await visible(page.getByText('E2E groceries')), 'app loads and records are available with the network disconnected');
  await page.goto(`${BASE}/#/rafiq`);
  await page.getByRole('button', { name: 'New conversation' }).click();
  await page.getByLabel('Describe your situation').fill('I have 30 JOD left and nine days until payday');
  await page.getByRole('button', { name: 'Send' }).click();
  await page.getByText(/You are offline — this answer is from the offline engine/).waitFor();
  ok(true, 'Rafiq answers offline and states it is not using Claude');
  await page.screenshot({ path: join(OUT, 'desktop-offline-rafiq.png') });
  await ctx.setOffline(false);

  // backup -> erase -> restore
  await page.goto(`${BASE}/#/settings`);
  await page.getByRole('button', { name: 'Back up now' }).click();
  await page.getByLabel('Passphrase', { exact: true }).fill('my test passphrase');
  await page.getByLabel('Repeat passphrase').fill('my test passphrase');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Encrypt & download/ }).click()]);
  const file = join(OUT, 'test-backup.rafiq');
  await download.saveAs(file);
  const backupText = readFileSync(file, 'utf8');
  ok(!backupText.includes('E2E groceries') && !backupText.includes('Electricity'), 'backup file is encrypted (no readable records)');
  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('button', { name: /Erase all data/ }).click();
  await page.getByText('All data erased').waitFor();
  await page.goto(`${BASE}/#/transactions`);
  ok((await visible(page.getByText('No transactions this month'))) && !(await page.getByText('E2E groceries').isVisible()), 'data erased');
  await page.goto(`${BASE}/#/settings`);
  await page.getByRole('button', { name: 'Restore', exact: true }).first().click();
  await page.locator('input[type=file]').setInputFiles(file);
  await page.getByLabel('Backup passphrase', { exact: true }).waitFor();
  await page.screenshot({ path: join(OUT, 'restore-step.png') });
  await page.getByLabel('Backup passphrase', { exact: true }).fill('wrong passphrase!');
  await page.getByRole('button', { name: /Unlock & check/ }).click();
  await page.getByText(/Wrong passphrase/).waitFor({ timeout: 15000 });
  ok(true, 'wrong passphrase rejected on import');
  await page.getByLabel('Backup passphrase', { exact: true }).fill('my test passphrase');
  await page.getByRole('button', { name: /Unlock & check/ }).click();
  await page.getByText('Backup is valid').waitFor({ timeout: 10000 });
  await page.getByRole('button', { name: /Replace my data/ }).click();
  await page.getByText('Backup restored').waitFor();
  await page.goto(`${BASE}/#/transactions`);
  ok(await visible(page.getByText('E2E groceries')), 'backup restored successfully');

  ok(errors.length === 0, `no uncaught page errors (${errors.join(' | ')})`);
  await ctx.close();

  // ------------------------------------------------------------ mobile
  const mctx = await browser.newContext({ ...devices['iPhone 13'] });
  const m = await mctx.newPage();
  m.on('dialog', (dd) => dd.accept());
  await m.goto(BASE);
  await m.getByRole('button', { name: /Start — add my current balance/ }).click();
  await m.getByLabel('Name').fill('Wallet');
  await m.getByLabel(/Balance \(JOD\)/).fill('120');
  await m.getByRole('button', { name: 'Save', exact: true }).click();
  await m.waitForTimeout(400);
  await m.screenshot({ path: join(OUT, 'mobile-dashboard.png') });
  const overflow = await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  ok(!overflow, 'no horizontal overflow on iPhone-sized screen');
  ok(await m.locator('.bottom-nav').isVisible(), 'mobile bottom navigation visible');
  await m.locator('.bottom-nav').getByRole('button', { name: 'Rafiq' }).click();
  await m.screenshot({ path: join(OUT, 'mobile-rafiq.png') });
  await m.locator('.bottom-nav').getByRole('button', { name: 'Plan' }).click();
  await m.screenshot({ path: join(OUT, 'mobile-plan.png'), fullPage: true });
  await mctx.close();
} catch (e) {
  failures++;
  console.log('FAIL  ' + e.message.split('\n')[0]);
  await page?.screenshot({ path: join(OUT, 'failure.png') }).catch(() => {});
} finally {
  await browser.close();
  server.kill();
}

// ------------------------------------------------------------ bundle secret scan
const walk = (dir) => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));
const bundle = walk('dist').map((f) => readFileSync(f, 'utf8')).join('\n');
ok(!bundle.includes(FAKE_KEY) && !/sk-ant-[a-z0-9]/i.test(bundle), 'no API key in the frontend bundle');
ok(!/env\.ANTHROPIC_API_KEY|\.ANTHROPIC_API_KEY\b(?!\s+or)/.test(bundle) && !bundle.includes('api.anthropic.com'), 'frontend never reads ANTHROPIC_API_KEY or calls Anthropic directly');
ok(!bundle.includes(CODE), 'access code not baked into the bundle');

console.log(failures ? `\n${failures} FAILED` : '\nALL ACCEPTANCE CHECKS PASSED');
process.exit(failures ? 1 : 0);

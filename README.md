# Rafiq — personal money accountability partner

Rafiq helps you decide what to do next with your money, and checks that you did it.

- **Dashboard** built around three questions: where do I stand, what can I safely spend, what should I do next.
- **Transactions**: income, expenses, transfers, categories, search, monthly comparisons.
- **Plan**: salary allocation, essential vs discretionary, spending limits, savings goals, commitments, 60-day cash-flow projection.
- **Debts**: balances, interest, minimums, repayments, snowball vs avalanche, realistic payoff dates.
- **Rafiq**: describe a situation in plain words; get a six-part answer (situation, constraints, recommendation, exact steps, impact, follow-up) based on your real records, then commit to it and get followed up.

**Start here: [docs/SETUP-GUIDE.md](docs/SETUP-GUIDE.md)** — a step-by-step guide for non-technical users.

## How it works

| | Offline (always) | Online (optional) |
|---|---|---|
| Your records | Stored on your device (IndexedDB) | Still only on your device |
| Calculations | Deterministic, in the app | Same — Claude never calculates |
| Rafiq answers | Built-in rules engine | Claude writes the answer from the app's figures; every figure is checked against your records |
| Internet needed | No | Only when you ask Claude |

- The Anthropic API key lives only in a server environment variable (`api/rafiq.ts`). It never reaches the browser.
- The server endpoint requires your private access code (`RAFIQ_ACCESS_CODE`), so strangers cannot use your key.
- Backups are encrypted on your device (PBKDF2-SHA256 600k iterations → AES-256-GCM).
- GitHub stores code only. `.gitignore`, `npm run check:secrets` and CI block `.env` files, API keys and backup files.

## Commands (for developers)

```bash
npm install        # install dependencies
npm start          # build and run at http://localhost:4173 (use this daily)
npm run dev        # development server with hot reload (separate data!)
npm test           # 47 unit tests: finance engine, Rafiq engine, backup, server
npm run test:e2e   # browser acceptance tests (needs Playwright + Chromium)
npm run check:secrets
```

Project layout: `src/lib` (pure logic: `finance.ts`, `rafiq/`, `backup.ts`, `db.ts`), `src/pages`, `src/components`, `api/rafiq.ts` (serverless Claude endpoint), `tests/`.

Rafiq is a decision-support tool, not regulated financial advice.
# rafiq

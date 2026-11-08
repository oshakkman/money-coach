# Rafiq — Complete Setup Guide (no technical background needed)

This guide takes you from nothing to using Rafiq every day on your phone and computer.
Follow the parts in order. Each step says **where** to click or type, **what you should see**, and **what to do if it fails**.

> **Which computer do you have?** Where steps differ, they are marked **🪟 Windows** or **🍎 Mac**. Follow only yours.

---

## What you are setting up (read this first — 2 minutes)

Rafiq is one app that can run in two ways:

| | **Online version** (recommended) | **Local version** (optional) |
|---|---|---|
| Where it runs | A free website only you know about (Vercel) | Only on your own computer |
| Works on iPhone / iPad / Android | ✅ Yes | ❌ No |
| Works without internet | ✅ Yes, after you install it once | ✅ Yes |
| Software to install | None — just a web browser | Node.js and Git |
| Claude AI help | ✅ Optional | ✅ Optional |

**Three facts that protect your money records — please remember them:**

1. **Your financial records are stored inside the browser on each device — never on the website, never on GitHub.**
   The website only delivers the app. Your numbers stay on your phone or laptop.
2. **Each device (and each address) has its own separate records.** Your phone and your laptop do not sync automatically.
   Pick **one main device** for daily use. To move data between devices, use an encrypted backup (Part 6).
3. **Browser storage is not a permanent backup.** Phones get lost and browsers get cleared. Create an encrypted backup at least once a week — Rafiq reminds you every 7 days.

**Recommended path:** Part 1 → Part 2 → Part 3 → Part 4 → (optional) Part 5 → Part 6.
Part 7 (local version) is only if you also want Rafiq to run entirely on your computer.

**Time needed:** about 30–40 minutes for Parts 1–4.

---

## Part 1 — Make your GitHub repository private (5 minutes)

Your app's code is stored on GitHub in a repository called **money-coach**. It is currently **public** (anyone can see the code). The code contains no personal data, but you asked for it to be private, and that is the safer choice.

1. On your computer, open **https://github.com** and sign in.
2. Open **https://github.com/oshakkman/money-coach**
3. Click **Settings** (the gear tab near the top of the repository page — not your account settings).
   *Don't see Settings?* Make sure you are signed in as the owner of this repository.
4. Scroll to the very bottom to the red **Danger Zone**.
5. Click **Change visibility** → **Change to private**.
6. GitHub asks you to confirm by typing the repository name. Type `oshakkman/money-coach` and confirm.

✅ **You should see** a small **Private** label next to the repository name at the top of the page.

> **Optional: rename it to `rafiq-money`.** In **Settings → General → Repository name**, type `rafiq-money` and click **Rename**. GitHub redirects the old address automatically. If you rename it, use the new name wherever this guide says `money-coach`.

### Part 1b — Put the finished app on the main branch

I built the app on a separate branch called `claude/sleepy-ramanujan-ridk24`. The hosting service publishes the **main** branch, so the work needs to be merged into it once:

1. On the repository page, you should see a yellow banner: **"claude/sleepy-ramanujan-ridk24 had recent pushes"** with a green **Compare & pull request** button. Click it.
   *No banner?* Click the **Pull requests** tab → **New pull request** → set **base: main** and **compare: claude/sleepy-ramanujan-ridk24** → **Create pull request**.
2. Click **Create pull request**.
3. Wait about a minute. You will see a check called **CI** run (it tests the app). It should turn green ✅.
4. Click **Merge pull request** → **Confirm merge**.

✅ **You should see** "Pull request successfully merged and closed". Your **main** branch now has the app.

*If CI shows a red ❌:* do not merge. Click **Details** next to the failed check, copy the red error text, and ask me.

---

## Part 2 — Publish the online version on Vercel (10 minutes, free)

Vercel hosts the app for free on its "Hobby" plan (for personal use). No credit card is needed.

1. Open **https://vercel.com/signup**
2. Choose **Hobby** (personal), enter your name, then click **Continue with GitHub**.
3. GitHub asks you to authorise Vercel. Click **Authorize Vercel**.
4. On the Vercel dashboard click **Add New…** → **Project**.
5. Under **Import Git Repository**, find **money-coach**.
   *Not listed?* Click **Adjust GitHub App Permissions** (or **Configure GitHub App**) → choose **Only select repositories** → select **money-coach** → **Save**. Return to Vercel; it now appears.
6. Click **Import** next to **money-coach**.
7. On the **Configure Project** screen:
   - **Framework Preset:** should say **Vite** (it is detected automatically). Leave everything else as it is.
   - Skip **Environment Variables** for now (that is Part 5, optional).
8. Click **Deploy**.
9. Wait 1–2 minutes. You will see build logs scrolling, then a **Congratulations!** screen with a preview of the app.
10. Click **Continue to Dashboard**. Under **Domains** you will see your app's address, for example:
    `https://money-coach-abc123.vercel.app`
    **Write this address down.** This is your Rafiq.

✅ **Test it:** open the address. You should see the Rafiq welcome screen ("Your personal money accountability partner").

**If the build fails (red "Error"):** click the failed deployment → **Building** logs → scroll to the first red line. The most common causes:
- *"Cannot find module"* → in Vercel, go to **Settings → General → Node.js Version**, choose **22.x**, then **Deployments → ⋯ → Redeploy**.
- Anything else → copy the red lines and ask me.

> **Who can see the website?** Anyone who knows the address can open the *app*, but they get an **empty** Rafiq — your records are on your devices, not on the website. Do not share the address anyway. Search engines are told not to list it.

---

## Part 3 — Install Rafiq on your devices so it works offline (5 minutes per device)

"Installing" puts Rafiq on your home screen like a normal app and saves it so it opens without internet.

### 📱 iPhone or iPad

1. Open **Safari** (it must be Safari for the most reliable result).
2. Go to your Rafiq address from Part 2.
3. Tap the **Share** button (square with an arrow pointing up — at the bottom on iPhone, at the top on iPad).
4. Scroll down and tap **Add to Home Screen**.
5. The name shows **Rafiq**. Tap **Add**.
6. Open Rafiq **from the new home-screen icon** (not from Safari) and keep it open for 10 seconds while online. This downloads everything needed for offline use.

✅ **Check offline works:** turn on **Airplane Mode**, then open Rafiq from the home screen. It should open normally with your data. Turn Airplane Mode off.

> **Important on iPhone/iPad:** always use Rafiq **from the home-screen icon**. Safari may delete data from websites you don't visit for 7 days, but home-screen apps are protected. The Safari tab and the home-screen app also keep **separate** data — use only the icon.

### 🤖 Android

1. Open **Chrome** and go to your Rafiq address.
2. Tap the **⋮** menu (top right) → **Install app** (or **Add to Home screen** → **Install**).
3. Open Rafiq from the new icon once while online.

### 💻 Windows or Mac computer

1. Open **Google Chrome** or **Microsoft Edge** and go to your Rafiq address.
2. In the address bar, click the **install icon** (a small monitor with a down-arrow, or **⊕**). Or: **⋮ menu → Cast, save and share → Install page as app** (Chrome) / **… menu → Apps → Install this site as an app** (Edge).
3. Click **Install**. Rafiq opens in its own window and appears in your Start menu / Applications.

✅ **Offline test:** disconnect Wi-Fi and open Rafiq. It should still work.

---

## Part 4 — First-time setup inside Rafiq (10 minutes)

Do this on your **main device** (usually your phone).

1. **Welcome screen:** choose your currency (JOD is the default) → tap **Start — add my current balance**.
2. **Add your balances** — one entry for each place you hold money:
   - *Name:* e.g. "Arab Bank", "Cash", "Savings"
   - *Type:* Bank, Cash, e-Wallet, or **Savings** (savings are *not* counted as spendable)
   - *Balance:* what is there **today**
3. On the Home screen, the **Setup** list shows what else to add. Tap each line:
   - **Income and payday** — e.g. "Salary", 900, Monthly, date of your next (or last) payday.
   - **Regular expenses** — rent, electricity, water, phone, internet, school, subscriptions. Mark each **Essential** (must pay) or not.
   - **Debts** — each card or loan: balance owed today, yearly interest rate (%), minimum monthly payment, due day.
   - **Savings goals** — e.g. "Emergency fund", target amount, already saved, amount per month.
   - **Expected commitments** — one-off costs you know are coming (fees, licence, Eid, wedding gift).
4. You don't need everything at once. Add what you know now; Rafiq never invents numbers.

### Daily use (1 minute a day)

- Tap **+** (phone) or **Add spending** (computer) whenever you spend.
- When a bill is paid or salary arrives, tap **✓** next to it under **Coming up**.
- Read **Do this next** on the Home screen and do it.
- Ask the **Rafiq** tab when a situation comes up, e.g. *"I have 30 JOD left and nine days until payday."* Tap **Commit to this plan** to turn its steps into tracked actions; Rafiq checks on you when they are due.

---

## Part 5 — (Optional) Connect Claude AI for smarter conversations

Without this step, Rafiq still answers every question using its built-in offline engine. Claude adds better judgement and wording. **All numbers are still calculated by the app**, and Rafiq checks every figure Claude writes against your records.

**Cost:** Anthropic charges per use. A typical Rafiq question costs roughly **2–6 US cents**. You prepay credit (minimum about $5) and can set a monthly limit. Nothing is charged if you don't use it.

**What is sent:** only when the "Ask Claude" switch is on, Rafiq sends a summary (balances, bills, debts, goals, budgets, recent amounts and categories — **never your notes**) to your Vercel server, which forwards it to Anthropic and keeps nothing.

### 5.1 Get an API key

1. Open **https://console.anthropic.com** and create an account (or sign in).
2. Go to **Settings → Billing** → add a payment method and buy credit (e.g. $5).
3. Go to **Settings → Limits** and set a **monthly spend limit** (e.g. $5) so costs can never surprise you.
4. Go to **API Keys** → **Create Key** → name it `rafiq` → **Create**.
5. **Copy the key** (it starts with `sk-ant-`). You will only see it once. Do **not** email it, paste it into chats, or save it in the app.

### 5.2 Invent your access code

Make up a private code of at least 12 characters, e.g. `olive-tree-river-2026`. This stops anyone who finds your website from using your API credit. Write it down somewhere safe.

### 5.3 Add both to Vercel (server-side only)

1. Vercel dashboard → your **money-coach** project → **Settings** → **Environment Variables**.
2. Add the first variable:
   - **Key:** `ANTHROPIC_API_KEY`
   - **Value:** paste your `sk-ant-…` key
   - Tick **Production**, **Preview** and **Development** → **Save**
3. Add the second variable:
   - **Key:** `RAFIQ_ACCESS_CODE`
   - **Value:** your access code from 5.2 → **Save**
4. Apply them: **Deployments** tab → click **⋯** on the top deployment → **Redeploy** → **Redeploy**. Wait ~1 minute until it says **Ready**.

### 5.4 Connect each device

1. Open Rafiq → tap the **⚙️ gear** (top right on phone) / **Settings & backup** (computer).
2. Under **Claude connection**, type your **access code** → tap **Test & save**.
3. ✅ **You should see:** `Connected ✓ (model: claude-opus-5-5)`

| If you see | Do this |
|---|---|
| "access code is wrong" | Re-type it exactly; codes are case-sensitive. |
| "not configured there" | Check both variable names in Vercel are spelled exactly as above, then Redeploy. |
| "Could not reach the server" | You are offline, or you are using the local version without a key (see Part 7). |

4. In the **Rafiq** tab, tick **Ask Claude** under the message box. The first time, Rafiq explains what is sent and asks your permission.
5. Each answer shows its source: *"Offline engine"* or *"Claude · all figures checked against your records"*. If Claude ever writes a figure that is not in your records, Rafiq warns you and names the figure.

**If an API key is ever exposed:** go to console.anthropic.com → API Keys → **Delete** it, create a new one, and update it in Vercel (step 5.3), then Redeploy.

---

## Part 6 — Backups: create, store, restore

### Create a backup (do this weekly — Rafiq reminds you)

1. **Settings → Back up now**.
2. Choose a **passphrase** (at least 10 characters — a short sentence is good). Type it twice.
3. Tap **Encrypt & download**. Rafiq checks the file opens correctly before saying it's done.
4. Store the file **off the device**:
   - **iPhone/iPad:** when asked, tap **Save to Files** → **iCloud Drive** → a folder like "Rafiq backups".
   - **Android:** it goes to **Downloads**; move it to Google Drive.
   - **Computer:** it goes to **Downloads**; move it to OneDrive / iCloud / Google Drive or a USB stick.

The file is named like `rafiq-backup-2026-11-08-14-30.rafiq`. It is encrypted — nobody can read it without your passphrase.

> ⚠️ **If you forget the passphrase, the backup cannot be opened by anyone — including you.** Store it in your password manager or somewhere safe on paper.
> ⚠️ **Never upload backup files to GitHub.** (The project is set up to block this automatically, but don't try.)

**Optional — automatic backups (Chrome or Edge on a computer only):** Settings → **Automatic folder backup** → enter a passphrase → **Choose folder & start** → pick a cloud-synced folder (e.g. OneDrive). Rafiq writes an encrypted backup 30 seconds after each change. For security the passphrase isn't saved, so after reopening Rafiq, press **Resume** once. This is not available on iPhone, iPad or Safari — use the manual backup there.

### Restore a backup (new phone, lost data, or moving devices)

1. Open Rafiq on the device you want to restore to. On a brand-new install, the welcome screen has **I have a backup to restore**; otherwise go to **Settings → Restore**.
2. Tap **Choose backup file** and pick your `.rafiq` file (on iPhone, browse **iCloud Drive** in the Files picker).
3. Enter the passphrase → **Unlock & check**.
4. Rafiq shows what the backup contains (e.g. "214 transactions, 3 accounts…"). Nothing has changed yet.
5. Tap **Replace my data with this backup**.

✅ Your data is back. Rafiq first saves a **safety snapshot** of what was there before, in case you picked the wrong file (**Settings → Recovery snapshots → Restore**).

### If something goes wrong with your data

- If Rafiq ever detects damaged data when opening, it shows a **Data recovery** screen instead of risking your records. Choose: **Try again**, **Restore from an encrypted backup**, **Restore snapshot**, or **Download raw data** (for repair help).
- Rafiq automatically keeps up to 8 internal snapshots — before every restore, erase, and app upgrade.

---

## Part 7 — (Optional) Run the local version on your own computer

Use this if you want Rafiq to run entirely on your computer without any website. Most people can skip it.

### 7.1 Install the required software (once)

**Node.js** (runs the app):
1. Open **https://nodejs.org** → download the **LTS** version (the button marked "LTS").
2. **🪟 Windows:** run the `.msi` file → Next, Next, accept, Next… → Install. Keep all default options.
   **🍎 Mac:** run the `.pkg` file → Continue → Agree → Install.

**Git** (downloads and updates the code):
- **🪟 Windows:** open **https://git-scm.com/download/win** → download "64-bit Git for Windows Setup" → run it → click **Next** on every screen (defaults are fine) → **Install**.
- **🍎 Mac:** you will be offered Git automatically the first time you use it in step 7.3 — click **Install** when asked.

### 7.2 Open the terminal (the window where you type commands)

- **🪟 Windows:** press the **Windows key**, type `PowerShell`, press **Enter**. A blue/black window opens.
- **🍎 Mac:** press **⌘ Cmd + Space**, type `Terminal`, press **Enter**. A white/black window opens.

Check the software works — type each line, then press **Enter**:

```
node --version
git --version
```

✅ **You should see** version numbers such as `v22.12.0` and `git version 2.47.0`.
❌ *"not recognized"* / *"command not found"*: close the terminal window, open a new one, and try again. If it still fails, restart your computer and reinstall the software from 7.1.

### 7.3 Download Rafiq

Type these lines one at a time, pressing **Enter** after each:

```
cd ~
git clone https://github.com/oshakkman/money-coach.git rafiq
cd rafiq
```

- Because the repository is private, a **GitHub sign-in window** opens (🪟 Windows), or you are asked for a username and password (🍎 Mac).
  - On Mac, for the password GitHub needs a **token**, not your normal password: go to **github.com → your photo → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token** → Repository access: **Only select repositories → money-coach** → Permissions: **Contents: Read-only** → **Generate**. Copy the token and paste it as the password (nothing appears as you paste — that's normal) → **Enter**.
- ✅ **You should see** `Cloning into 'rafiq'…` and `done`.

> **Easier alternative without Git:** on the GitHub repository page click the green **Code** button → **Download ZIP**, unzip it into your home folder, rename the folder to `rafiq`, then in the terminal type `cd ~/rafiq`. (Updating later means downloading the ZIP again.)

### 7.4 Install and start

Make sure you are in the rafiq folder (`cd ~/rafiq`), then:

```
npm install
```

Wait 1–3 minutes. ✅ You should see `added … packages`. Warnings in yellow are normal. Then:

```
npm start
```

✅ **You should see** something like:

```
  ➜  Local:   http://localhost:4173/
```

Open **http://localhost:4173** in Chrome or Edge. Rafiq appears. You can install it as an app (Part 3, computer instructions) so it opens without the terminal being visible — **but the terminal must still be running for the first install**; after that the installed app works offline by itself.

**To stop Rafiq:** click the terminal window and press **Ctrl + C**.
**To start it again later:** open the terminal and type:

```
cd ~/rafiq
npm start
```

| Problem | Fix |
|---|---|
| `Port 4173 is in use` | Rafiq is already running in another terminal window — use that, or close it. Do **not** change the port: your local data belongs to `localhost:4173`. |
| `npm: command not found` / not recognized | Reinstall Node.js (7.1), then open a new terminal. |
| `EACCES` or permission errors on Mac | Make sure you ran the commands inside your home folder (`cd ~/rafiq`), not with `sudo`. |
| A page opens but is blank | Press **Ctrl + Shift + R** (🍎 **⌘ + Shift + R**) to reload. |

> Always use **`npm start`** for daily use. (`npm run dev` is a developer mode on a different address with **separate, empty** data.)

### 7.5 (Optional) Claude in the local version

1. In the `rafiq` folder, make a copy of `.env.example` named `.env.local`:
   - **🪟 Windows:** `Copy-Item .env.example .env.local`
   - **🍎 Mac:** `cp .env.example .env.local`
2. Open it in a text editor:
   - **🪟 Windows:** `notepad .env.local`
   - **🍎 Mac:** `open -e .env.local`
3. Fill in the two lines and save:

```
ANTHROPIC_API_KEY=sk-ant-your-key-here
RAFIQ_ACCESS_CODE=your-access-code
```

4. Stop Rafiq (**Ctrl + C**) and run `npm start` again. Then do Part 5.4 at `http://localhost:4173`.

`.env.local` stays on your computer only — the project is configured so Git never uploads it.

---

## Part 8 — Updating Rafiq without losing your records

Your records live in your browser, **not in the app's code**, so updating the code never deletes them. Still, make a backup first — it's a good habit.

### Online version (automatic)

1. **Settings → Back up now** (just in case).
2. When new code is merged into the **main** branch on GitHub, Vercel republishes the site automatically within about 2 minutes.
3. Next time you open Rafiq (online), a banner appears: **"A new version of Rafiq is available. Your data is kept."** → tap **Update**.

If an update ever looks wrong, Vercel can undo it: **Deployments** → find the previous one → **⋯ → Promote to Production** (Vercel calls this "Instant Rollback").

### Local version

1. In Rafiq: **Settings → Back up now**.
2. In the terminal (stop Rafiq first with **Ctrl + C**):

```
cd ~/rafiq
git pull
npm install
npm start
```

✅ `git pull` shows the changed files (or "Already up to date."). Your data is untouched.

When the app's internal data structure changes in a future version, Rafiq automatically saves a **safety snapshot** before upgrading (visible in **Settings → Recovery snapshots**).

---

## Part 9 — Quick troubleshooting

| Symptom | What it means / what to do |
|---|---|
| My data is "gone" on another device | Each device has its own data. Restore your latest backup on that device (Part 6). |
| My data is "gone" on iPhone | Make sure you opened Rafiq from the **home-screen icon**, not a Safari tab — they are separate. |
| "Safe to spend" looks wrong | Check balances (Plan → Accounts), unpaid bills (Home → Coming up: tick paid ones), and your payday date (Plan → Income). |
| Debt timelines look off | Update each debt's balance from your latest statement (Debts → Edit). Interest isn't added automatically. |
| Rafiq says "Claude unavailable" | It falls back to the offline engine automatically. Check you're online, then Settings → Test & save. Check your Anthropic credit balance. |
| Backup: "Wrong passphrase, or the file has been modified" | The passphrase is case-sensitive; try again carefully. If you truly forgot it, that backup cannot be opened. |
| Rafiq shows the "Data recovery" screen | Don't panic — nothing was deleted. Try **Restore from an encrypted backup** first. |

---

## Safety summary

- ✅ Records stay on your devices. GitHub holds only code. Vercel holds only code and (optionally) your API key in a secure server variable.
- ✅ The API key never reaches the browser. The server refuses requests without your access code.
- ✅ Backups are encrypted with AES-256; the passphrase never leaves your device.
- ⚠️ Browser storage is **not** a backup. Back up weekly and keep the file off the device.
- ⚠️ Rafiq is a decision-support tool based on what you record. It is not regulated financial advice.

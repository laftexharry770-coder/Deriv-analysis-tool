# Binary Analysis Tool

Signals-only digit analyser for Deriv Volatility indices: scans every volatility market, ranks them by
digit deviation, auto-selects the best one, issues **MATCH / DIFFER** calls with a validity countdown,
and scores every call against the real next tick. Accounts, a $70/month subscription with manual payment
verification, and an owner admin console are built in. No trades are ever placed.

Live site: <https://laftexharry770-coder.github.io/Deriv-analysis-tool/>

## How it is built

| Part | Where | Notes |
|---|---|---|
| Website | `index.html`, `css/app.css`, `js/**` | static, no build step; works on phones and PCs; light + dark theme |
| Engine | `js/stats.js`, `js/signals.js`, `js/tracker.js` | pure, tested with `node --test` |
| Accounts / payments | Supabase project `matches-sniper` (`omhnpuoxkqmcjfnchryq`) | Auth + Postgres + 3 Edge Functions in `supabase/functions/` |
| Tests | `tests/*.test.js` | `node --test "tests/*.test.js"` (55 tests) |

## One-time setup (owner)

1. **Email sending** — Supabase → Edge Functions → Secrets:
   `GMAIL_USER` = your Gmail, `GMAIL_APP_PASSWORD` = a 16-character App Password
   (Google Account → Security → 2-Step Verification → App passwords). Optional instead: `RESEND_API_KEY`.
   Until these exist, the tool still works: approvals show the activation code in Admin so you can send it on WhatsApp.
2. **Your receiving details** — log in, open **Admin → Your receiving details** and fill in Skrill email,
   Binance Pay ID, USDT address + network, bank details, M-Pesa number. They appear on every user's Upgrade page.
3. **Owner account** — only `thecorinthian999@gmail.com` sees the Admin panel; it logs in without verification
   and has every feature. The email is fixed in `js/config.js`, `supabase/functions/_shared/common.ts` and the
   `admin_emails` table (change all three together; no environment secret is involved). Nobody can re-register that
   address: a forgotten owner password is recovered through *Forgot password* like any other account, so set up the
   mail secrets in step 1 before you need it.
4. **GitHub Pages** — repo *Settings → Pages → Deploy from branch → `main` / root* (one click). Every later
   deploy: run `python tools/bump-version.py` (cache-busts the assets), commit, push.
5. **Deriv feed** — uses Deriv's public market-data socket (`wss://api.derivws.com/trading/v1/options/ws/public`):
   no app id and no token needed. The `pat_` tokens and alphanumeric App IDs from the new api.deriv.com dashboard belong
   to Deriv's OAuth/REST platform and are rejected by the classic gateway — you don't need them. The simulator remains
   available in Settings for demos.

## How a user gets in

Landing page → Create account (email, phone, password) → 6-digit code by email (or **Verify via WhatsApp**
if email is not working: the owner searches the user in Admin → *Users* and presses **Confirm email**, which lets
them log in without a code; *Verify now* additionally grants PREMIUM) → Upgrade: pay by Skrill / Trust Wallet /
Binance / bank / local mobile money (picked from the phone's country) → submit "I have paid" → owner approves →
activation code by email or WhatsApp → Account → Activate → **PREMIUM ✓** for 30 days.

## Pages

Landing (public / unpaid) · Dashboard · Volatility Scanner · Matches / Differs · Matches Signal ·
Frequency Graph · Accuracy · Settings · Account · Upgrade · Support · Admin (owner only).

## What the numbers mean

- **The digit** — the real-time engine (`js/deep.js`) works on each market's LIVE tick stream (seeded with the
  1 000 newest ticks Deriv hands over on connect, then every tick as it arrives). For every digit it pools two views
  of the same real data: a recency-weighted appearance rate (newest ticks weigh most; PRO weighs them harder) and the
  transition view (what has followed the current last digit so far), both shrunk toward the 10 % baseline. The
  digit with the highest pooled probability is the prediction (DIFFER: the lowest). The Scanner runs the same engine
  on all markets at once and applies the market whose top digit carries the strongest **edge z**; a MATCHES signal
  (sniper entry) is only issued when that pick also passes every gate (live ticks, edge ≥ threshold, digit seen
  recently, live feed, cooldown) — otherwise the card says WATCH.
- **Signal strength (0–100)** — percentile of the pick's edge z against the 10 % uniform baseline. Not a win probability.
- **appearance rate / probability** — the engine's pooled probability for the digit (DIFFER: one minus it), always
  shown against the 10 % / 90 % base with the next most likely digits beside it. Digits are random: the next tick
  is never guaranteed, which is why Accuracy scores every call against the real tick that followed.
- **No latency figures** — the tool does not measure or gate on tick lag; the live circle and strip repaint on every
  tick of the active market, and only the parts that changed are redrawn (nothing stalls while you scroll on a phone).
- **Accuracy** — real win-rate of every call the tool issued, scored on the actual tick that followed, with a 95 % interval.

## Redeploying an Edge Function

Edit `supabase/functions/<name>/index.ts` (shared code in `_shared/`) and redeploy through the Supabase
dashboard or CLI (`supabase functions deploy <name>`). Functions run with `verify_jwt` off and check the
user's bearer token themselves.

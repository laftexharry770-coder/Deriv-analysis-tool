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
3. **Owner accounts** — `mwangiherbert225@gmail.com`, `thecorinthian999@gmail.com` and phone `+254758584977`
   log in without verification and have every feature (set in `js/config.js`, the `admin_emails` /
   `admin_phones` tables, and the `ADMIN_EMAILS` / `ADMIN_PHONES` secrets).
4. **GitHub Pages** — repo *Settings → Pages → Deploy from branch → `main` / root* (one click). Every later
   deploy: run `python tools/bump-version.py` (cache-busts the assets), commit, push.
5. **Deriv feed** — uses Deriv's public market-data socket (`wss://api.derivws.com/trading/v1/options/ws/public`):
   no app id and no token needed. The `pat_` tokens and alphanumeric App IDs from the new api.deriv.com dashboard belong
   to Deriv's OAuth/REST platform and are rejected by the classic gateway — you don't need them. The simulator remains
   available in Settings for demos.

## How a user gets in

Landing page → Create account (email, phone, password) → 6-digit code by email (or **Verify via WhatsApp**
if email is not working: the owner uses Admin → *Verify any user*) → Upgrade: pay by Skrill / Trust Wallet /
Binance / bank / local mobile money (picked from the phone's country) → submit "I have paid" → owner approves →
activation code by email or WhatsApp → Account → Activate → **PREMIUM ✓** for 30 days.

## Pages

Landing (public / unpaid) · Dashboard · Volatility Scanner · Matches / Differs · Matches Signal ·
Frequency Graph · Accuracy · Settings · Account · Upgrade · Support · Admin (owner only).

## What the numbers mean

- **Signal strength (0–100)** — percentile of the digit's blended z-score under a uniform null. Not a win probability.
- **est. probability** — shrunk estimate of the digit hitting (for DIFFER: not hitting), always shown against the 10 % / 90 % base.
- **Accuracy** — real win-rate of every call the tool issued, scored on the actual tick that followed, with a 95 % interval.

## Redeploying an Edge Function

Edit `supabase/functions/<name>/index.ts` (shared code in `_shared/`) and redeploy through the Supabase
dashboard or CLI (`supabase functions deploy <name>`). Functions run with `verify_jwt` off and check the
user's bearer token themselves.

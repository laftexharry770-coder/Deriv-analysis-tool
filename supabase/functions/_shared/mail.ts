// Outbound email: Gmail SMTP (App Password) first, Resend API if configured instead.
// Secrets: GMAIL_USER + GMAIL_APP_PASSWORD  |  RESEND_API_KEY (+ optional MAIL_FROM)
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';

const BRAND = Deno.env.get('BRAND_NAME') ?? 'Binary Analysis Tool';
const SITE_URL = Deno.env.get('SITE_URL') ?? 'https://laftexharry770-coder.github.io/Deriv-analysis-tool/';
const OWNER_WHATSAPP = Deno.env.get('OWNER_WHATSAPP') ?? '+254 751 851 228';
const OWNER_EMAIL = Deno.env.get('OWNER_EMAIL') ?? 'mwangiherbert225@gmail.com';

export function mailConfigured(): boolean {
  return !!(Deno.env.get('RESEND_API_KEY') || (Deno.env.get('GMAIL_USER') && Deno.env.get('GMAIL_APP_PASSWORD')));
}

export async function sendMail(msg: { to: string; subject: string; html: string; text: string }) {
  const gmailUser = Deno.env.get('GMAIL_USER'), gmailPass = Deno.env.get('GMAIL_APP_PASSWORD');
  const resendKey = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('MAIL_FROM') ?? (gmailUser ? `${BRAND} <${gmailUser}>` : `${BRAND} <onboarding@resend.dev>`);
  if (gmailUser && gmailPass) {
    const client = new SMTPClient({ connection: { hostname: 'smtp.gmail.com', port: 465, tls: true, auth: { username: gmailUser, password: gmailPass } } });
    try { await client.send({ from, to: msg.to, subject: msg.subject, content: msg.text, html: msg.html }); }
    finally { try { await client.close(); } catch { /* already closed */ } }
    return { via: 'gmail' };
  }
  if (resendKey) {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [msg.to], subject: msg.subject, html: msg.html, text: msg.text }),
    });
    if (!r.ok) throw new Error('RESEND_FAILED ' + r.status + ' ' + (await r.text()).slice(0, 200));
    return { via: 'resend' };
  }
  throw new Error('MAIL_NOT_CONFIGURED');
}

function shell(title: string, bodyHtml: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f3f6fb;color:#0f1b33;font-family:Segoe UI,Roboto,Arial,sans-serif;padding:24px">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e3e8f2;border-radius:14px;padding:24px">
    <div style="font-weight:700;letter-spacing:.04em;color:#2563eb;margin-bottom:8px">&#9672; ${BRAND}</div>
    <h1 style="font-size:20px;margin:0 0 12px;color:#0f1b33">${title}</h1>${bodyHtml}
    <p style="font-size:12px;color:#5b6b85;margin-top:24px">Need help? WhatsApp ${OWNER_WHATSAPP} &middot; ${OWNER_EMAIL}<br><a href="${SITE_URL}" style="color:#2563eb">${SITE_URL}</a></p>
  </div></body></html>`;
}
const codeBox = (code: string) => `<div style="font-family:Consolas,Menlo,monospace;font-size:34px;letter-spacing:.3em;font-weight:800;background:#0b1324;border:1px solid #131d33;border-radius:10px;padding:16px;text-align:center;margin:16px 0;color:#7fb0ff">${code}</div>`;

export function codeEmail(kind: 'verify_email' | 'activate_premium' | 'reset_password', code: string, ctx: { accountId?: string; minutes?: number; days?: number } = {}) {
  const minutes = ctx.minutes ?? 15;
  if (kind === 'verify_email') {
    const text = `Your ${BRAND} verification code is ${code}. It expires in ${minutes} minutes.${ctx.accountId ? ` Your account ID is ${ctx.accountId}.` : ''}`;
    return { subject: `${code} is your ${BRAND} verification code`, text, html: shell('Verify your email', `<p>Enter this code on the website to activate your account${ctx.accountId ? ` <b>${ctx.accountId}</b>` : ''}.</p>${codeBox(code)}<p style="color:#5b6b85">The code expires in ${minutes} minutes. If you did not sign up, ignore this email.</p>`) };
  }
  if (kind === 'activate_premium') {
    const text = `Your payment was confirmed. Enter activation code ${code} on the ${BRAND} website (Account → Activate) to unlock PREMIUM for ${ctx.days ?? 30} days. Expires in ${minutes} minutes.`;
    return { subject: `${code} — your ${BRAND} PREMIUM activation code`, text, html: shell('Payment confirmed — activate PREMIUM', `<p>Your payment was confirmed. Enter this activation code under <b>Account → Activate premium</b>${ctx.accountId ? ` for account <b>${ctx.accountId}</b>` : ''} to unlock <b>PREMIUM</b> for ${ctx.days ?? 30} days and the verified tick.</p>${codeBox(code)}<p style="color:#5b6b85">The code expires in ${minutes} minutes. Ask the owner for a new one if it lapses.</p>`) };
  }
  const text = `Your ${BRAND} password reset code is ${code}. It expires in ${minutes} minutes.`;
  return { subject: `${code} — reset your ${BRAND} password`, text, html: shell('Reset your password', `<p>Enter this code together with your new password.</p>${codeBox(code)}<p style="color:#5b6b85">The code expires in ${minutes} minutes. If you did not request a reset, ignore this email.</p>`) };
}

export function ownerClaimEmail(claim: { email: string; account_id?: string | null; method: string; amount?: number | null; currency?: string | null; reference?: string | null; note?: string | null }) {
  const text = `New payment claim from ${claim.email} (${claim.account_id ?? 'no id'}): ${claim.method} ${claim.amount ?? ''} ${claim.currency ?? ''} ref ${claim.reference ?? '-'}. ${claim.note ?? ''}\nReview it in Admin: ${SITE_URL}`;
  return { subject: `Payment claim: ${claim.email} · ${claim.method} · ${claim.amount ?? '?'} ${claim.currency ?? ''}`, text,
    html: shell('New payment claim', `<p><b>${claim.email}</b> (${claim.account_id ?? 'no id'}) says they paid via <b>${claim.method}</b>.</p><table style="font-size:14px"><tr><td style="color:#5b6b85;padding-right:12px">Amount</td><td>${claim.amount ?? '?'} ${claim.currency ?? ''}</td></tr><tr><td style="color:#5b6b85">Reference</td><td>${claim.reference ?? '-'}</td></tr><tr><td style="color:#5b6b85">Note</td><td>${claim.note ?? '-'}</td></tr></table><p>Open <b>Admin → Pending claims</b> to approve or reject.</p>`) };
}

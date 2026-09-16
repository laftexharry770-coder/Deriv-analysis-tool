// auth: signup · verify_email · resend · reset_request · reset_confirm
// Public endpoint (verify_jwt off): every action authenticates by email + code, never by session.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { CORS, json, fail, serviceClient, readBody, normEmail, validEmail, validPhone, issueCode, consumeCode, secondsSinceLastCode, isAdminEmail } from '../_shared/common.ts';
import { mailConfigured, sendMail, codeEmail } from '../_shared/mail.ts';

async function findUserByEmail(sb: ReturnType<typeof serviceClient>, email: string) {
  const { data: profile } = await sb.from('profiles').select('id, account_id, email_verified').ilike('email', email).maybeSingle();
  return profile ?? null;
}

async function deliverCode(sb: ReturnType<typeof serviceClient>, opts: { userId: string | null; email: string; purpose: 'verify_email' | 'reset_password'; accountId?: string }) {
  const code = await issueCode(sb, { userId: opts.userId, email: opts.email, purpose: opts.purpose });
  if (!mailConfigured()) return { mailed: false, reason: 'MAIL_NOT_CONFIGURED' };
  try {
    const m = codeEmail(opts.purpose, code, { accountId: opts.accountId });
    await sendMail({ to: opts.email, ...m });
    return { mailed: true };
  } catch (e) {
    console.error('mail failed', String(e));
    return { mailed: false, reason: 'MAIL_FAILED' };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return fail('METHOD', 405);
  const body = await readBody(req);
  const action = String(body.action ?? '');
  const sb = serviceClient();
  const email = normEmail(body.email);

  try {
    if (action === 'signup') {
      const password = String(body.password ?? '');
      const phone = String(body.phone ?? '').replace(/[\s()-]/g, '');
      const countryCode = String(body.country_code ?? '').replace(/\D/g, '');
      if (!validEmail(email)) return fail('EMAIL_INVALID');
      if (password.length < 8) return fail('PASSWORD_TOO_SHORT');
      if (!validPhone(phone)) return fail('PHONE_INVALID');
      const admin = isAdminEmail(email); // the owner email: no verification, no payment needed
      const existing = await findUserByEmail(sb, email);
      // A verified account (and the owner account in every case) can never be re-registered: signup must not be a
      // way to set a new password on somebody else's account. Lost passwords go through reset_request / reset_confirm.
      if (existing && (existing.email_verified || admin)) return fail('EMAIL_EXISTS');
      let userId: string; let accountId: string | undefined;
      if (existing) {
        // unverified account being re-registered: the new password wins once the email proves itself
        const { error } = await sb.auth.admin.updateUserById(existing.id, { password, email_confirm: admin ? true : undefined, user_metadata: { phone, country_code: countryCode } });
        if (error) return fail('SIGNUP_FAILED', 500, { detail: error.message });
        await sb.from('profiles').update({ phone, country_code: countryCode, updated_at: new Date().toISOString() }).eq('id', existing.id);
        userId = existing.id; accountId = existing.account_id;
      } else {
        const { data, error } = await sb.auth.admin.createUser({ email, password, email_confirm: admin, user_metadata: { phone, country_code: countryCode } });
        if (error || !data.user) return fail('SIGNUP_FAILED', 500, { detail: error?.message });
        userId = data.user.id;
        const { data: p } = await sb.from('profiles').select('account_id').eq('id', userId).maybeSingle();
        accountId = p?.account_id;
      }
      if (admin) {
        await sb.from('profiles').update({ is_admin: true, verified: true, email_verified: true, premium_until: new Date(Date.now() + 100 * 365.25 * 86_400_000).toISOString(), updated_at: new Date().toISOString() }).eq('id', userId);
        return json({ ok: true, account_id: accountId, admin: true, mailed: false });
      }
      const d = await deliverCode(sb, { userId, email, purpose: 'verify_email', accountId });
      return json({ ok: true, account_id: accountId, mailed: d.mailed, reason: d.reason });
    }

    if (action === 'verify_email') {
      if (!validEmail(email)) return fail('EMAIL_INVALID');
      const existing = await findUserByEmail(sb, email);
      if (!existing) return fail('NO_ACCOUNT');
      const r = await consumeCode(sb, { email, purpose: 'verify_email', code: String(body.code ?? '') });
      if (!r.ok) return fail(r.error, 400, { attemptsLeft: (r as { attemptsLeft?: number }).attemptsLeft });
      const { error } = await sb.auth.admin.updateUserById(existing.id, { email_confirm: true });
      if (error) return fail('CONFIRM_FAILED', 500, { detail: error.message });
      await sb.from('profiles').update({ email_verified: true, updated_at: new Date().toISOString() }).eq('id', existing.id);
      return json({ ok: true, account_id: existing.account_id });
    }

    if (action === 'resend' || action === 'reset_request') {
      if (!validEmail(email)) return fail('EMAIL_INVALID');
      const purpose = action === 'resend' ? 'verify_email' : 'reset_password';
      const existing = await findUserByEmail(sb, email);
      // do not reveal whether an email is registered
      if (!existing) return json({ ok: true, mailed: true });
      if (purpose === 'verify_email' && existing.email_verified) return fail('ALREADY_VERIFIED');
      const since = await secondsSinceLastCode(sb, email, purpose);
      if (since != null && since < 60) return fail('RATE_LIMITED', 429, { retryIn: Math.ceil(60 - since) });
      const d = await deliverCode(sb, { userId: existing.id, email, purpose, accountId: existing.account_id });
      return json({ ok: true, mailed: d.mailed, reason: d.reason });
    }

    if (action === 'reset_confirm') {
      const password = String(body.password ?? '');
      if (!validEmail(email)) return fail('EMAIL_INVALID');
      if (password.length < 8) return fail('PASSWORD_TOO_SHORT');
      const existing = await findUserByEmail(sb, email);
      if (!existing) return fail('NO_ACCOUNT');
      const r = await consumeCode(sb, { email, purpose: 'reset_password', code: String(body.code ?? '') });
      if (!r.ok) return fail(r.error, 400, { attemptsLeft: (r as { attemptsLeft?: number }).attemptsLeft });
      const { error } = await sb.auth.admin.updateUserById(existing.id, { password, email_confirm: true });
      if (error) return fail('RESET_FAILED', 500, { detail: error.message });
      return json({ ok: true });
    }

    return fail('UNKNOWN_ACTION', 404);
  } catch (e) {
    console.error(action, String(e));
    return fail('SERVER_ERROR', 500, { detail: String(e).slice(0, 200) });
  }
});

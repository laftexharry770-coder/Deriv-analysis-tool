// admin: owner-only actions. Caller must be signed in AND (profiles.is_admin OR email in ADMIN_EMAILS).
// list_claims · approve_claim · reject_claim · verify_user · send_activation · revoke · list_users · get_settings · save_settings
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { CORS, json, fail, serviceClient, userFromRequest, readBody, normEmail, validEmail, issueCode, grantPremium, isAdminEmail, PREMIUM_DAYS } from '../_shared/common.ts';
import { mailConfigured, sendMail, codeEmail } from '../_shared/mail.ts';

const SETTINGS_FIELDS = ['skrill_email', 'binance_pay_id', 'binance_uid', 'trust_wallet_address', 'trust_wallet_network', 'bank_details', 'mpesa_number', 'mpesa_name', 'notes'];

async function profileByEmail(sb: ReturnType<typeof serviceClient>, email: string) {
  const { data } = await sb.from('profiles').select('*').ilike('email', email).maybeSingle();
  return data ?? null;
}

/** Issues an activation code for `email`; mails it when possible, otherwise hands it to the admin for manual delivery. */
async function activationFor(sb: ReturnType<typeof serviceClient>, p: { id: string; email: string; account_id: string }) {
  const code = await issueCode(sb, { userId: p.id, email: p.email, purpose: 'activate_premium', ttlMin: 60 });
  if (mailConfigured()) {
    try { await sendMail({ to: p.email, ...codeEmail('activate_premium', code, { accountId: p.account_id, minutes: 60, days: PREMIUM_DAYS }) }); return { mailed: true }; }
    catch (e) { console.error('activation mail failed', String(e)); return { mailed: false, code, reason: 'MAIL_FAILED' }; }
  }
  return { mailed: false, code, reason: 'MAIL_NOT_CONFIGURED' };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return fail('METHOD', 405);
  const user = await userFromRequest(req);
  if (!user) return fail('UNAUTHENTICATED', 401);
  const sb = serviceClient();
  const { data: me } = await sb.from('profiles').select('is_admin, email').eq('id', user.id).maybeSingle();
  if (!(me?.is_admin || isAdminEmail(user.email))) return fail('FORBIDDEN', 403);
  const body = await readBody(req);
  const action = String(body.action ?? '');
  const reviewer = normEmail(user.email);

  try {
    if (action === 'list_claims') {
      const status = String(body.status ?? 'pending');
      let q = sb.from('payment_claims').select('*').order('created_at', { ascending: false }).limit(200);
      if (status !== 'all') q = q.eq('status', status);
      const { data } = await q;
      return json({ ok: true, claims: data ?? [] });
    }

    if (action === 'approve_claim' || action === 'reject_claim') {
      const id = String(body.id ?? '');
      const { data: claim } = await sb.from('payment_claims').select('*').eq('id', id).maybeSingle();
      if (!claim) return fail('NO_CLAIM', 404);
      if (claim.status !== 'pending') return fail('ALREADY_REVIEWED');
      const status = action === 'approve_claim' ? 'approved' : 'rejected';
      await sb.from('payment_claims').update({ status, reviewed_at: new Date().toISOString(), reviewed_by: reviewer, review_note: String(body.note ?? '').slice(0, 300) || null }).eq('id', id);
      if (status === 'rejected') return json({ ok: true, status });
      const p = await profileByEmail(sb, claim.email);
      if (!p) return fail('NO_PROFILE', 404);
      const d = await activationFor(sb, p);
      return json({ ok: true, status, ...d });
    }

    if (action === 'send_activation' || action === 'verify_user' || action === 'revoke') {
      const email = normEmail(body.email);
      if (!validEmail(email)) return fail('EMAIL_INVALID');
      const p = await profileByEmail(sb, email);
      if (!p) return fail('NO_ACCOUNT', 404);
      if (action === 'send_activation') { const d = await activationFor(sb, p); return json({ ok: true, account_id: p.account_id, ...d }); }
      if (action === 'revoke') {
        await sb.from('profiles').update({ premium_until: null, verified: false, updated_at: new Date().toISOString() }).eq('id', p.id);
        return json({ ok: true, account_id: p.account_id });
      }
      // verify_user: instant premium + tick, and the email is confirmed so the person can log in
      const days = Math.max(1, Math.min(3650, Number(body.days ?? PREMIUM_DAYS) || PREMIUM_DAYS));
      if (!p.email_verified) {
        const { error } = await sb.auth.admin.updateUserById(p.id, { email_confirm: true });
        if (error) return fail('CONFIRM_FAILED', 500, { detail: error.message });
        await sb.from('profiles').update({ email_verified: true }).eq('id', p.id);
      }
      const until = await grantPremium(sb, p.id, days);
      return json({ ok: true, account_id: p.account_id, premium_until: until, days });
    }

    if (action === 'list_users') {
      const q = String(body.q ?? '').trim();
      let query = sb.from('profiles').select('id, account_id, email, phone, country_code, email_verified, verified, premium_until, is_admin, created_at').order('created_at', { ascending: false }).limit(100);
      if (q) query = query.or(`email.ilike.%${q.replace(/[%,]/g, '')}%,account_id.ilike.%${q.replace(/[%,]/g, '')}%`);
      const { data } = await query;
      return json({ ok: true, users: data ?? [] });
    }

    if (action === 'get_settings') {
      const { data } = await sb.from('payment_settings').select('*').eq('id', 1).maybeSingle();
      return json({ ok: true, settings: data ?? {}, mail_configured: mailConfigured() });
    }

    if (action === 'save_settings') {
      const patch: Record<string, string | null> = {};
      for (const k of SETTINGS_FIELDS) if (k in body) patch[k] = String(body[k] ?? '').slice(0, 1000) || null;
      const { data, error } = await sb.from('payment_settings').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', 1).select().single();
      if (error) return fail('SAVE_FAILED', 500, { detail: error.message });
      return json({ ok: true, settings: data });
    }

    return fail('UNKNOWN_ACTION', 404);
  } catch (e) {
    console.error(action, String(e));
    return fail('SERVER_ERROR', 500, { detail: String(e).slice(0, 200) });
  }
});

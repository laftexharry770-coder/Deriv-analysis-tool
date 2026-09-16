// account: me · claim_payment · activate  — requires the signed-in user's bearer token
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { CORS, json, fail, serviceClient, userFromRequest, readBody, normEmail, consumeCode, grantPremium, PREMIUM_DAYS, isAdminEmail, ADMIN_EMAILS } from '../_shared/common.ts';
import { mailConfigured, sendMail, ownerClaimEmail } from '../_shared/mail.ts';

const METHODS = new Set(['skrill', 'trust_wallet', 'binance', 'bank', 'local']);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return fail('METHOD', 405);
  const user = await userFromRequest(req);
  if (!user) return fail('UNAUTHENTICATED', 401);
  const body = await readBody(req);
  const action = String(body.action ?? '');
  const sb = serviceClient();

  try {
    const { data: profile } = await sb.from('profiles').select('*').eq('id', user.id).maybeSingle();
    if (!profile) return fail('NO_PROFILE', 404);
    const isAdmin = isAdminEmail(user.email); // the owner email alone decides

    if (action === 'me') {
      const { data: claims } = await sb.from('payment_claims').select('id, method, reference, amount, currency, status, created_at, reviewed_at, review_note')
        .eq('user_id', user.id).order('created_at', { ascending: false }).limit(20);
      const { data: settings } = await sb.from('payment_settings').select('*').eq('id', 1).maybeSingle();
      return json({ ok: true, profile: { ...profile, is_admin: isAdmin }, claims: claims ?? [], settings: settings ?? {}, mail_configured: mailConfigured(), premium_days: PREMIUM_DAYS, server_time: new Date().toISOString() });
    }

    if (action === 'claim_payment') {
      const method = String(body.method ?? '');
      if (!METHODS.has(method)) return fail('METHOD_INVALID');
      const amount = body.amount == null || body.amount === '' ? null : Number(body.amount);
      if (amount != null && !(amount >= 0 && amount < 1e9)) return fail('AMOUNT_INVALID');
      const { data: pending } = await sb.from('payment_claims').select('id').eq('user_id', user.id).eq('status', 'pending');
      if ((pending?.length ?? 0) >= 3) return fail('TOO_MANY_PENDING');
      const row = {
        user_id: user.id, account_id: profile.account_id, email: normEmail(user.email), method,
        reference: String(body.reference ?? '').slice(0, 200) || null, amount,
        currency: String(body.currency ?? 'USD').slice(0, 8).toUpperCase(), note: String(body.note ?? '').slice(0, 500) || null,
      };
      const { data: claim, error } = await sb.from('payment_claims').insert(row).select().single();
      if (error) return fail('CLAIM_FAILED', 500, { detail: error.message });
      let notified = false;
      if (mailConfigured()) {
        try { const m = ownerClaimEmail(row); for (const to of ADMIN_EMAILS) await sendMail({ to, ...m }); notified = true; }
        catch (e) { console.error('owner mail failed', String(e)); }
      }
      return json({ ok: true, claim, owner_notified: notified });
    }

    if (action === 'activate') {
      const r = await consumeCode(sb, { email: normEmail(user.email), purpose: 'activate_premium', code: String(body.code ?? '') });
      if (!r.ok) return fail(r.error, 400, { attemptsLeft: (r as { attemptsLeft?: number }).attemptsLeft });
      const until = await grantPremium(sb, user.id, PREMIUM_DAYS);
      return json({ ok: true, premium_until: until, days: PREMIUM_DAYS });
    }

    return fail('UNKNOWN_ACTION', 404);
  } catch (e) {
    console.error(action, String(e));
    return fail('SERVER_ERROR', 500, { detail: String(e).slice(0, 200) });
  }
});

// Shared helpers for the Matches Sniper Edge Functions (Deno / Supabase).
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

export const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
export const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
// The owner account. Only this email sees the Admin panel and may call the admin function; it also signs in
// without verification and has full access without payment. Fixed in code on purpose (no environment override),
// so no stale secret can widen it.
export const ADMIN_EMAILS = ['thecorinthian999@gmail.com'];
export const PREMIUM_DAYS = Number(Deno.env.get('PREMIUM_DAYS') ?? '30');

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}
export function fail(error: string, status = 400, extra: Record<string, unknown> = {}): Response {
  return json({ ok: false, error, ...extra }, status);
}

export function serviceClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Resolves the signed-in user from the request's bearer token, or null. */
export async function userFromRequest(req: Request) {
  const header = req.headers.get('Authorization') ?? '';
  const token = header.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const { data, error } = await serviceClient().auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

export function isAdminEmail(email: string | null | undefined): boolean {
  return ADMIN_EMAILS.includes(String(email ?? '').toLowerCase());
}

export async function readBody(req: Request): Promise<Record<string, unknown>> {
  try { const b = await req.json(); return (b && typeof b === 'object') ? b as Record<string, unknown> : {}; } catch { return {}; }
}

export const normEmail = (e: unknown) => String(e ?? '').trim().toLowerCase();
export const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 254;
export const validPhone = (p: string) => /^\+?\d{7,15}$/.test(p.replace(/[\s()-]/g, ''));

export async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function genCode(): string {
  const a = new Uint32Array(1); crypto.getRandomValues(a);
  return String(a[0] % 1000000).padStart(6, '0');
}

export type Purpose = 'verify_email' | 'activate_premium' | 'reset_password';

/** Creates a fresh 6-digit code for email+purpose (older unused codes are invalidated). */
export async function issueCode(sb: SupabaseClient, opts: { userId?: string | null; email: string; purpose: Purpose; ttlMin?: number }): Promise<string> {
  const email = normEmail(opts.email);
  const code = genCode();
  await sb.from('activation_codes').update({ used_at: new Date().toISOString() })
    .eq('email', email).eq('purpose', opts.purpose).is('used_at', null);
  const { error } = await sb.from('activation_codes').insert({
    user_id: opts.userId ?? null, email, purpose: opts.purpose,
    code_hash: await sha256(code + ':' + email),
    expires_at: new Date(Date.now() + (opts.ttlMin ?? 15) * 60_000).toISOString(),
  });
  if (error) throw new Error('CODE_STORE_FAILED: ' + error.message);
  return code;
}

/** Checks a code; burns it on success, counts attempts on failure. */
export async function consumeCode(sb: SupabaseClient, opts: { email: string; purpose: Purpose; code: string }) {
  const email = normEmail(opts.email);
  const code = String(opts.code ?? '').replace(/\D/g, '');
  if (code.length !== 6) return { ok: false as const, error: 'CODE_INVALID' };
  const { data: rows } = await sb.from('activation_codes').select('*')
    .eq('email', email).eq('purpose', opts.purpose).is('used_at', null)
    .order('created_at', { ascending: false }).limit(1);
  const row = rows?.[0];
  if (!row) return { ok: false as const, error: 'NO_CODE' };
  if (new Date(row.expires_at).getTime() < Date.now()) return { ok: false as const, error: 'CODE_EXPIRED' };
  if (row.attempts >= 5) return { ok: false as const, error: 'TOO_MANY_ATTEMPTS' };
  const hash = await sha256(code + ':' + email);
  if (hash !== row.code_hash) {
    await sb.from('activation_codes').update({ attempts: row.attempts + 1 }).eq('id', row.id);
    return { ok: false as const, error: 'CODE_INVALID', attemptsLeft: 4 - row.attempts };
  }
  await sb.from('activation_codes').update({ used_at: new Date().toISOString() }).eq('id', row.id);
  return { ok: true as const, row };
}

/** Seconds since the newest code for email+purpose, or null. Used for resend throttling. */
export async function secondsSinceLastCode(sb: SupabaseClient, email: string, purpose: Purpose): Promise<number | null> {
  const { data } = await sb.from('activation_codes').select('created_at').eq('email', normEmail(email)).eq('purpose', purpose)
    .order('created_at', { ascending: false }).limit(1);
  if (!data?.[0]) return null;
  return (Date.now() - new Date(data[0].created_at).getTime()) / 1000;
}

/** Extends premium by `days` from the later of now and the current expiry; sets the green tick. */
export async function grantPremium(sb: SupabaseClient, userId: string, days: number) {
  const { data: p } = await sb.from('profiles').select('premium_until').eq('id', userId).single();
  const base = Math.max(Date.now(), p?.premium_until ? new Date(p.premium_until).getTime() : 0);
  const until = new Date(base + days * 86_400_000).toISOString();
  const { error } = await sb.from('profiles').update({ premium_until: until, verified: true, updated_at: new Date().toISOString() }).eq('id', userId);
  if (error) throw new Error('GRANT_FAILED: ' + error.message);
  return until;
}

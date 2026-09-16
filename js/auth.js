// matches-sniper/js/auth.js — Supabase session + the login / sign-up / verify / reset screens
(function (root) {
  'use strict';
  const C = root.MS.ui && root.MS.ui.components;
  const cfg = root.MS.config;
  let client = null, view = null, onSignedIn = null, mode = 'login', pendingEmail = '', resendAt = 0, busy = false;

  const DIAL = [['254', 'Kenya'], ['255', 'Tanzania'], ['256', 'Uganda'], ['250', 'Rwanda'], ['257', 'Burundi'], ['251', 'Ethiopia'], ['252', 'Somalia'], ['211', 'South Sudan'],
    ['234', 'Nigeria'], ['233', 'Ghana'], ['225', "Côte d'Ivoire"], ['237', 'Cameroon'], ['221', 'Senegal'], ['260', 'Zambia'], ['263', 'Zimbabwe'], ['265', 'Malawi'], ['258', 'Mozambique'],
    ['264', 'Namibia'], ['267', 'Botswana'], ['27', 'South Africa'], ['20', 'Egypt'], ['212', 'Morocco'], ['91', 'India'], ['92', 'Pakistan'], ['880', 'Bangladesh'], ['63', 'Philippines'],
    ['62', 'Indonesia'], ['60', 'Malaysia'], ['84', 'Vietnam'], ['971', 'UAE'], ['966', 'Saudi Arabia'], ['44', 'United Kingdom'], ['1', 'USA / Canada'], ['61', 'Australia'], ['49', 'Germany'], ['33', 'France'], ['55', 'Brazil']];

  const MESSAGES = {
    EMAIL_INVALID: 'Enter a valid email address.', PASSWORD_TOO_SHORT: 'Use at least 8 characters for the password.', PHONE_INVALID: 'Enter a valid phone number (digits only, 7–15).',
    EMAIL_EXISTS: 'This email already has an account — log in instead.', NO_ACCOUNT: 'No account with that email.', CODE_INVALID: 'That code is not right.', CODE_EXPIRED: 'That code has expired — request a new one.',
    NO_CODE: 'No active code for this email — request a new one.', TOO_MANY_ATTEMPTS: 'Too many wrong attempts — request a new code.', RATE_LIMITED: 'Please wait a minute before requesting another code.',
    ALREADY_VERIFIED: 'This email is already verified — log in.', UNAUTHENTICATED: 'Please log in again.', FORBIDDEN: 'Admin only.', SERVER_ERROR: 'Something went wrong on the server. Try again.',
    MAIL_NOT_CONFIGURED: 'Email sending is not set up yet, so no code was sent. Use "Verify via WhatsApp" below and the owner will activate you.', MAIL_FAILED: 'The email could not be sent. Try "Resend" or contact the owner.',
    invalid_login_credentials: 'Wrong email or password.', email_not_confirmed: 'Verify your email first — enter the code we sent you.'
  };
  const msg = (code, fallback) => MESSAGES[code] || fallback || String(code || 'Unknown error');

  function init() {
    if (client) return client;
    if (!root.supabase || !root.supabase.createClient) throw new Error('supabase-js failed to load');
    client = root.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
    return client;
  }
  async function getSession() { const { data } = await init().auth.getSession(); return data.session || null; }
  function onChange(fn) { init().auth.onAuthStateChange((event, session) => fn(event, session)); }

  /** Calls an Edge Function with the session token (if any). Always resolves to the JSON body. */
  async function call(fn, payload) {
    const session = await getSession();
    const headers = { 'Content-Type': 'application/json', apikey: cfg.supabaseKey };
    if (session) headers.Authorization = 'Bearer ' + session.access_token;
    let res;
    try { res = await fetch(cfg.supabaseUrl + '/functions/v1/' + fn, { method: 'POST', headers, body: JSON.stringify(payload || {}) }); }
    catch (e) { return { ok: false, error: 'NETWORK', detail: String(e) }; }
    try { return await res.json(); } catch (e) { return { ok: false, error: 'SERVER_ERROR', status: res.status }; }
  }
  const signup = (p) => call('auth', { action: 'signup', email: p.email, phone: p.phone, country_code: p.countryCode, password: p.password });
  const verifyEmail = (p) => call('auth', { action: 'verify_email', email: p.email, code: p.code });
  const resend = (p) => call('auth', { action: 'resend', email: p.email });
  const resetRequest = (p) => call('auth', { action: 'reset_request', email: p.email });
  const resetConfirm = (p) => call('auth', { action: 'reset_confirm', email: p.email, code: p.code, password: p.password });
  async function login(p) {
    const { data, error } = await init().auth.signInWithPassword({ email: p.email, password: p.password });
    if (error) return { ok: false, error: error.code || error.message, detail: error.message };
    return { ok: true, session: data.session };
  }
  async function logout() { await init().auth.signOut(); }
  const me = () => call('account', { action: 'me' });

  // ---------- auth screen ----------
  let pendingAccountId = '';
  function waVerify(email) { const text = 'Hello, please verify my ' + cfg.brand + ' account ' + (pendingAccountId ? pendingAccountId + ' ' : '') + '(' + (email || 'my email') + '). I could not receive the email code.'; return cfg.contact.whatsappLink + '?text=' + encodeURIComponent(text); }
  function contactLine() {
    return '<div class="auth-contact">Help: <a href="' + C.esc(cfg.contact.whatsappLink) + '" target="_blank" rel="noopener">WhatsApp ' + C.esc(cfg.contact.whatsapp) + '</a> · <a href="mailto:' + C.esc(cfg.contact.email) + '">' + C.esc(cfg.contact.email) + '</a></div>';
  }
  function dialSelect(selected) {
    return '<select name="country_code" id="auth-cc" aria-label="Country code">' + DIAL.map(([d, n]) => '<option value="' + d + '"' + (d === selected ? ' selected' : '') + '>+' + d + ' ' + C.esc(n) + '</option>').join('') + '</select>';
  }
  function form() {
    const tabs = '<div class="auth-tabs"><button type="button" data-mode="login" class="' + (mode === 'login' ? 'on' : '') + '">Log in</button><button type="button" data-mode="signup" class="' + (mode === 'signup' ? 'on' : '') + '">Create account</button></div>';
    if (mode === 'login') return tabs + '<form id="auth-form" class="form" autocomplete="on"><div class="field"><label for="auth-email">Email</label><input type="email" id="auth-email" name="email" required autocomplete="email" value="' + C.esc(pendingEmail) + '"></div>'
      + '<div class="field"><label for="auth-password">Password</label><input type="password" id="auth-password" name="password" required autocomplete="current-password" minlength="8"></div>'
      + '<button type="submit" class="btn primary wide">Log in</button><button type="button" class="btn ghost wide" data-mode="reset">Forgot password?</button><button type="button" class="btn ghost wide" data-mode="verify">I have a verification code</button></form>';
    if (mode === 'signup') return tabs + '<form id="auth-form" class="form" autocomplete="on"><div class="field"><label for="auth-email">Email</label><input type="email" id="auth-email" name="email" required autocomplete="email" value="' + C.esc(pendingEmail) + '"></div>'
      + '<div class="field"><label for="auth-phone">Phone number</label><div class="phone-row">' + dialSelect('254') + '<input type="tel" id="auth-phone" name="phone" required inputmode="numeric" placeholder="7XX XXX XXX" autocomplete="tel-national"></div><div class="hint">Used to pick your local payment method. No SMS is sent.</div></div>'
      + '<div class="field"><label for="auth-password">Password (8+ characters)</label><input type="password" id="auth-password" name="password" required minlength="8" autocomplete="new-password"></div>'
      + '<button type="submit" class="btn primary wide">Create account</button><div class="hint">We will email you a 6-digit code to verify your address.</div></form>';
    if (mode === 'verify') return '<h3>Verify your email</h3><p class="intro">Enter the 6-digit code we emailed to you. Check spam if it is not in your inbox.</p><form id="auth-form" class="form"><div class="field"><label for="auth-email">Email</label><input type="email" id="auth-email" name="email" required value="' + C.esc(pendingEmail) + '"></div>'
      + '<div class="field"><label for="auth-code">Verification code</label><input type="text" id="auth-code" name="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required placeholder="123456" class="code-input" autocomplete="one-time-code"></div>'
      + '<button type="submit" class="btn primary wide">Verify</button><button type="button" class="btn ghost wide" data-act="resend">Resend code</button>'
      + '<a class="btn wide" data-act="wa-verify" href="' + C.esc(waVerify(pendingEmail)) + '" target="_blank" rel="noopener">Code not arriving? Verify via WhatsApp</a>'
      + '<button type="button" class="btn ghost wide" data-mode="login">Back to log in</button></form>';
    // reset
    return '<h3>Reset password</h3><p class="intro">Request a code, then enter it with your new password.</p><form id="auth-form" class="form"><div class="field"><label for="auth-email">Email</label><input type="email" id="auth-email" name="email" required value="' + C.esc(pendingEmail) + '"></div>'
      + '<button type="button" class="btn wide" data-act="reset-request">Email me a code</button>'
      + '<div class="field"><label for="auth-code">Code</label><input type="text" id="auth-code" name="code" inputmode="numeric" maxlength="6" placeholder="123456" class="code-input" autocomplete="one-time-code"></div>'
      + '<div class="field"><label for="auth-password">New password</label><input type="password" id="auth-password" name="password" minlength="8" autocomplete="new-password"></div>'
      + '<button type="submit" class="btn primary wide">Set new password</button><button type="button" class="btn ghost wide" data-mode="login">Back to log in</button></form>';
  }
  function render(notice) {
    if (!view) return;
    view.innerHTML = '<div class="auth-card"><button type="button" class="auth-close" data-act="close" aria-label="Close">×</button><div class="auth-brand"><span class="logo">◈</span> ' + C.esc(cfg.brand) + '</div><div class="auth-sub">Deriv volatility indices · digit analysis · MATCHES signals · $' + cfg.priceUsd + '/month</div>'
      + (notice ? '<div class="auth-notice ' + C.esc(notice.kind || 'info') + '">' + C.esc(notice.text) + '</div>' : '') + form() + contactLine() + '</div>';
    view.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => { mode = b.getAttribute('data-mode'); render(); }));
    const cl = view.querySelector('[data-act="close"]'); if (cl) cl.addEventListener('click', () => hideAuthView());
    const wa = view.querySelector('[data-act="wa-verify"]'); if (wa) wa.addEventListener('click', () => { const e = view.querySelector('#auth-email'); if (e && e.value) wa.href = waVerify(e.value.trim()); });
    const f = view.querySelector('#auth-form');
    f.addEventListener('submit', (e) => { e.preventDefault(); submit(f); });
    const rs = view.querySelector('[data-act="resend"]'); if (rs) rs.addEventListener('click', () => resendCode(f));
    const rr = view.querySelector('[data-act="reset-request"]'); if (rr) rr.addEventListener('click', () => requestReset(f));
  }
  function values(f) { const o = {}; new FormData(f).forEach((v, k) => { o[k] = String(v).trim(); }); return o; }
  function notify(text, kind) { render({ text, kind }); }
  async function guard(fn) { if (busy) return; busy = true; try { await fn(); } finally { busy = false; } }

  async function submit(f) {
    const v = values(f); pendingEmail = v.email || pendingEmail;
    await guard(async () => {
      if (mode === 'login') {
        const r = await login({ email: v.email, password: v.password });
        if (!r.ok) { if (r.error === 'email_not_confirmed') { mode = 'verify'; notify(msg(r.error), 'warn'); } else notify(msg(r.error, r.detail), 'bad'); return; }
        onSignedIn && onSignedIn(r.session);
      } else if (mode === 'signup') {
        const phone = '+' + v.country_code + String(v.phone || '').replace(/\D/g, '').replace(/^0+/, '');
        const r = await signup({ email: v.email, phone, countryCode: v.country_code, password: v.password });
        if (!r.ok) { notify(msg(r.error, r.detail), 'bad'); return; }
        if (r.admin) { mode = 'login'; notify('Owner account ' + r.account_id + ' is ready — log in to continue.', 'ok'); return; }
        mode = 'verify'; resendAt = Date.now() + 60000; pendingAccountId = r.account_id || '';
        notify(r.mailed ? 'Account ' + r.account_id + ' created — enter the code we emailed you.' : 'Account ' + r.account_id + ' created. ' + msg(r.reason), r.mailed ? 'ok' : 'warn');
      } else if (mode === 'verify') {
        const r = await verifyEmail({ email: v.email, code: v.code });
        if (!r.ok) { notify(msg(r.error), 'bad'); return; }
        mode = 'login'; notify('Email verified — account ' + r.account_id + ' is active. Log in to continue.', 'ok');
      } else if (mode === 'reset') {
        if (!v.code || !v.password) { notify('Request a code first, then enter it with your new password.', 'warn'); return; }
        const r = await resetConfirm({ email: v.email, code: v.code, password: v.password });
        if (!r.ok) { notify(msg(r.error), 'bad'); return; }
        mode = 'login'; notify('Password updated — log in with the new password.', 'ok');
      }
    });
  }
  async function resendCode(f) {
    const v = values(f); pendingEmail = v.email || pendingEmail;
    if (Date.now() < resendAt) { notify('Wait ' + Math.ceil((resendAt - Date.now()) / 1000) + ' s before resending.', 'warn'); return; }
    await guard(async () => { const r = await resend({ email: v.email }); resendAt = Date.now() + 60000; notify(r.ok ? (r.mailed ? 'A new code was sent.' : msg(r.reason)) : msg(r.error), r.ok && r.mailed ? 'ok' : 'warn'); });
  }
  async function requestReset(f) {
    const v = values(f); pendingEmail = v.email || pendingEmail;
    await guard(async () => { const r = await resetRequest({ email: v.email }); notify(r.ok ? (r.mailed ? 'If that email has an account, a code is on its way.' : msg(r.reason)) : msg(r.error), r.ok && r.mailed ? 'ok' : 'warn'); });
  }

  function mountAuthView(el, opts) { view = el; onSignedIn = opts && opts.onSignedIn; }
  function showAuthView(m, notice) { if (m) mode = m; view.hidden = false; render(notice); }
  function hideAuthView() { view.hidden = true; view.innerHTML = ''; }

  root.MS.auth = { init, getSession, onChange, call, signup, verifyEmail, resend, resetRequest, resetConfirm, login, logout, me, mountAuthView, showAuthView, hideAuthView, msg, DIAL };
})(typeof globalThis !== 'undefined' ? globalThis : this);

// matches-sniper/js/ui/admin.js — owner console: claims, verify any email, send codes, users, receiving details
(function (root) {
  'use strict';
  const C = root.MS.ui.components, cfg = root.MS.config;
  let el = null, act = null;
  const data = { claims: [], claimStatus: 'pending', users: [], q: '', settings: {}, mailConfigured: null, lastCode: null, loaded: false };

  async function load() {
    const [c, s] = await Promise.all([act.admin({ action: 'list_claims', status: data.claimStatus }), act.admin({ action: 'get_settings' })]);
    if (c && c.ok) data.claims = c.claims; if (s && s.ok) { data.settings = s.settings || {}; data.mailConfigured = !!s.mail_configured; }
    data.loaded = true; render();
  }
  async function searchUsers() { const r = await act.admin({ action: 'list_users', q: data.q }); if (r && r.ok) data.users = r.users; render(); }

  function codeNotice() {
    if (!data.lastCode) return '';
    return '<div class="banner" style="margin-bottom:12px"><div class="banner-title">Activation code for ' + C.esc(data.lastCode.email) + ' (' + C.esc(data.lastCode.account_id || '') + ')</div><div class="banner-body">' + (data.lastCode.mailed ? 'The code was emailed to the user.' : 'Email is not configured (' + C.esc(data.lastCode.reason || '') + '), so send this code to the user yourself (WhatsApp works). It is valid for 60 minutes:') + '</div>' + (data.lastCode.code ? '<div class="code-big">' + C.esc(data.lastCode.code) + '</div>' : '') + '<div class="banner-actions"><button type="button" class="btn ghost" data-act="dismiss-code">Dismiss</button></div></div>';
  }

  function render() {
    if (!el) return;
    const mailNote = data.mailConfigured === false ? '<div class="banner" style="margin-bottom:12px"><div class="banner-title">Email sending is not configured yet</div><div class="banner-body">Add the secrets GMAIL_USER and GMAIL_APP_PASSWORD (a Gmail App Password) in Supabase → Edge Functions → Secrets, then redeploy nothing — they are read on every request. Until then: new sign-ups cannot receive their code, so when a user WhatsApps you, search them below and press <b>Confirm email</b>; approvals show the activation code here so you can send it by WhatsApp.</div></div>' : '';
    const claimsRows = data.claims.map(c => [C.esc(new Date(c.created_at).toLocaleString()), C.esc(c.email) + '<br><span class="mono small muted">' + C.esc(c.account_id || '') + '</span>', C.esc(c.method), C.esc(c.reference || '—'), C.esc((c.amount == null ? '' : c.amount + ' ') + (c.currency || '')), C.esc(c.note || ''),
      c.status === 'pending' ? '<div class="row"><button type="button" class="btn primary small-btn" data-approve="' + C.esc(c.id) + '">Approve</button><button type="button" class="btn danger small-btn" data-reject="' + C.esc(c.id) + '">Reject</button></div>' : C.pill(c.status.toUpperCase(), c.status === 'approved' ? 'ok' : 'bad') + (c.reviewed_by ? '<div class="small muted">' + C.esc(c.reviewed_by) + '</div>' : '')]);
    const userRows = data.users.map(u => {
      const premium = root.MS.access.isPremium(u);
      return ['<span class="mono">' + C.esc(u.account_id) + '</span>' + (u.verified && premium ? ' <span class="tick small-tick">✓</span>' : ''), C.esc(u.email) + (u.email_verified ? '' : ' <span class="warn-t small">unverified</span>'), C.esc(u.phone || '—'), premium ? '<span class="ok-t">PREMIUM</span> until ' + C.esc(new Date(u.premium_until).toLocaleDateString()) : '<span class="muted">free</span>',
        '<div class="row">' + (u.email_verified ? '' : '<button type="button" class="btn primary small-btn" data-confirm="' + C.esc(u.email) + '">Confirm email</button>') + '<button type="button" class="btn small-btn" data-verify="' + C.esc(u.email) + '">Verify now</button><button type="button" class="btn ghost small-btn" data-code="' + C.esc(u.email) + '">Send code</button>' + (premium ? '<button type="button" class="btn danger small-btn" data-revoke="' + C.esc(u.email) + '">Revoke</button>' : '') + '</div>'];
    });
    const s = data.settings || {};
    const field = (k, label, hint) => '<div class="field"><label for="ps-' + k + '">' + label + '</label><input type="text" id="ps-' + k + '" name="' + k + '" value="' + C.esc(s[k] || '') + '">' + (hint ? '<div class="hint">' + hint + '</div>' : '') + '</div>';
    el.innerHTML = C.pageTitle('⚑', 'Admin', 'Claims, verification, users, receiving details') + mailNote + codeNotice()
      + '<div class="card"><div class="card-head"><h3>Payment claims</h3><div class="segmented">' + ['pending', 'approved', 'rejected', 'all'].map(k => '<button type="button" data-status="' + k + '" class="' + (data.claimStatus === k ? 'on' : '') + '">' + k + '</button>').join('') + '</div></div>'
      + (data.loaded ? C.table(['When', 'User', 'Method', 'Reference', 'Amount', 'Note', 'Action'], claimsRows, { empty: 'No ' + data.claimStatus + ' claims' }) : '<div class="muted">Loading…</div>') + '</div>'
      + '<div class="card"><div class="card-head"><h3>Verify any user</h3><div class="sub">works whether or not they have paid — <b>Confirm email</b> lets a user whose code never arrived log in (WhatsApp path, no premium); <b>Verify now</b> gives instant PREMIUM + tick; or send them a code</div></div>'
      + '<form id="verify-form" class="form"><div class="field-row"><div class="field"><label for="vf-email">Email</label><input type="email" id="vf-email" name="email" required placeholder="user@example.com"></div><div class="field"><label for="vf-days">Days</label><input type="number" id="vf-days" name="days" value="' + cfg.premiumDays + '" min="1" max="3650"></div></div>'
      + '<div class="controls"><button type="button" class="btn primary" data-act="confirm-email">Confirm email</button><button type="submit" class="btn">Verify now (PREMIUM)</button><button type="button" class="btn ghost" data-act="send-code">Send activation code</button></div></form></div>'
      + '<div class="card"><div class="card-head"><h3>Users</h3></div><form id="user-search" class="row"><input type="text" name="q" placeholder="search email or account ID" value="' + C.esc(data.q) + '"><button type="submit" class="btn">Search</button></form><div style="margin-top:10px">' + C.table(['Account', 'Email', 'Phone', 'Plan', 'Actions'], userRows, { empty: 'Search to list users' }) + '</div></div>'
      + '<div class="card"><div class="card-head"><h3>Your receiving details</h3><div class="sub">shown to users on the Upgrade page</div></div><form id="settings-form" class="form">'
      + '<div class="field-row">' + field('skrill_email', 'Skrill email') + field('binance_pay_id', 'Binance Pay ID') + field('binance_uid', 'Binance UID (optional)') + field('trust_wallet_address', 'USDT wallet address') + field('trust_wallet_network', 'USDT network', 'e.g. TRC20 (USDT) — users must send on this network') + field('mpesa_number', 'M-Pesa / mobile-money number', 'e.g. 07XX XXX XXX') + field('mpesa_name', 'Registered name (optional)') + '</div>'
      + '<div class="field"><label for="ps-bank_details">Bank details</label><textarea id="ps-bank_details" name="bank_details" rows="3">' + C.esc(s.bank_details || '') + '</textarea><div class="hint">bank name, account name, account number, branch / SWIFT</div></div>'
      + '<div class="field"><label for="ps-notes">Extra instructions (optional)</label><textarea id="ps-notes" name="notes" rows="2">' + C.esc(s.notes || '') + '</textarea></div>'
      + '<div class="controls"><button type="submit" class="btn primary">Save details</button></div></form></div>';

    el.querySelectorAll('[data-status]').forEach(b => b.addEventListener('click', () => { data.claimStatus = b.getAttribute('data-status'); load(); }));
    el.querySelectorAll('[data-approve]').forEach(b => b.addEventListener('click', async () => { const r = await act.admin({ action: 'approve_claim', id: b.getAttribute('data-approve') }); if (r && r.ok) { const c = data.claims.find(x => x.id === b.getAttribute('data-approve')); data.lastCode = { email: c && c.email, account_id: c && c.account_id, code: r.code, mailed: r.mailed, reason: r.reason }; act.toast('Approved', 'ok'); } else act.toast(root.MS.auth.msg(r && r.error), 'bad'); load(); }));
    el.querySelectorAll('[data-reject]').forEach(b => b.addEventListener('click', async () => { const note = root.prompt('Reason for rejecting (shown to the user):', '') || ''; const r = await act.admin({ action: 'reject_claim', id: b.getAttribute('data-reject'), note }); act.toast(r && r.ok ? 'Rejected' : root.MS.auth.msg(r && r.error), r && r.ok ? 'ok' : 'bad'); load(); }));
    const dc = el.querySelector('[data-act="dismiss-code"]'); if (dc) dc.addEventListener('click', () => { data.lastCode = null; render(); });
    el.querySelector('#verify-form').addEventListener('submit', async (e) => { e.preventDefault(); const email = el.querySelector('#vf-email').value.trim(); const days = Number(el.querySelector('#vf-days').value) || cfg.premiumDays; const r = await act.admin({ action: 'verify_user', email, days }); act.toast(r && r.ok ? r.account_id + ' is PREMIUM until ' + new Date(r.premium_until).toLocaleDateString() : root.MS.auth.msg(r && r.error), r && r.ok ? 'ok' : 'bad'); if (data.q) searchUsers(); });
    el.querySelector('[data-act="confirm-email"]').addEventListener('click', async () => { const email = el.querySelector('#vf-email').value.trim(); const r = await act.admin({ action: 'confirm_email', email }); act.toast(r && r.ok ? (r.already ? r.account_id + ' was already confirmed' : r.account_id + ' can log in now') : root.MS.auth.msg(r && r.error), r && r.ok ? 'ok' : 'bad'); if (data.q) searchUsers(); });
    el.querySelectorAll('[data-confirm]').forEach(b => b.addEventListener('click', async () => { const r = await act.admin({ action: 'confirm_email', email: b.getAttribute('data-confirm') }); act.toast(r && r.ok ? 'Email confirmed — the user can log in' : root.MS.auth.msg(r && r.error), r && r.ok ? 'ok' : 'bad'); searchUsers(); }));
    el.querySelector('[data-act="send-code"]').addEventListener('click', async () => { const email = el.querySelector('#vf-email').value.trim(); const r = await act.admin({ action: 'send_activation', email }); if (r && r.ok) { data.lastCode = { email, account_id: r.account_id, code: r.code, mailed: r.mailed, reason: r.reason }; render(); } else act.toast(root.MS.auth.msg(r && r.error), 'bad'); });
    el.querySelector('#user-search').addEventListener('submit', (e) => { e.preventDefault(); data.q = e.target.q.value.trim(); searchUsers(); });
    el.querySelectorAll('[data-verify]').forEach(b => b.addEventListener('click', async () => { const r = await act.admin({ action: 'verify_user', email: b.getAttribute('data-verify') }); act.toast(r && r.ok ? 'Verified' : root.MS.auth.msg(r && r.error), r && r.ok ? 'ok' : 'bad'); searchUsers(); }));
    el.querySelectorAll('[data-code]').forEach(b => b.addEventListener('click', async () => { const email = b.getAttribute('data-code'); const r = await act.admin({ action: 'send_activation', email }); if (r && r.ok) { data.lastCode = { email, account_id: r.account_id, code: r.code, mailed: r.mailed, reason: r.reason }; render(); } else act.toast(root.MS.auth.msg(r && r.error), 'bad'); }));
    el.querySelectorAll('[data-revoke]').forEach(b => b.addEventListener('click', async () => { if (!root.confirm('Remove PREMIUM from ' + b.getAttribute('data-revoke') + '?')) return; const r = await act.admin({ action: 'revoke', email: b.getAttribute('data-revoke') }); act.toast(r && r.ok ? 'Revoked' : root.MS.auth.msg(r && r.error), r && r.ok ? 'ok' : 'bad'); searchUsers(); }));
    el.querySelector('#settings-form').addEventListener('submit', async (e) => { e.preventDefault(); const v = { action: 'save_settings' }; new FormData(e.target).forEach((val, k) => { v[k] = String(val).trim(); }); const r = await act.admin(v); if (r && r.ok) { data.settings = r.settings; act.toast('Saved', 'ok'); } else act.toast(root.MS.auth.msg(r && r.error), 'bad'); });
  }

  root.MS.ui.admin = {
    mount(rootEl, actions) { el = rootEl; act = actions; },
    render: () => {
      if (data.loaded) { render(); return; }
      if (el) el.innerHTML = C.pageTitle('⚑', 'Admin', 'Claims, verification, users, receiving details') + '<div class="card muted">Loading claims and settings…</div>';
      load().catch((e) => { data.loaded = true; render(); act.toast('Admin data failed to load: ' + String(e), 'bad'); });
    },
    reload: load
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);

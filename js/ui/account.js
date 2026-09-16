// matches-sniper/js/ui/account.js — account id, premium badge + green tick, activation code, contact, log out
(function (root) {
  'use strict';
  const C = root.MS.ui.components, A = root.MS.access, cfg = root.MS.config;
  let el = null, act = null;

  function badge(profile) {
    const b = A.accountBadge(profile);
    return '<div class="acct-id-row"><span class="acct-id">' + C.esc(b.id) + '</span>' + (b.tick ? '<span class="tick" title="Verified premium user">✓</span>' : '') + C.pill(b.tier, b.tier === 'PREMIUM' ? 'ok' : 'warn') + '</div>';
  }

  function render(state) {
    if (!el) return;
    const p = state.profile; if (!p) { el.innerHTML = '<h2>Account</h2><div class="card muted">Not signed in.</div>'; return; }
    const b = A.accountBadge(p);
    const premium = b.tier === 'PREMIUM';
    const claims = state.account && state.account.claims ? state.account.claims : [];
    const pendingClaim = claims.find(c => c.status === 'pending'), approvedClaim = claims.find(c => c.status === 'approved');
    el.innerHTML = C.pageTitle('◉', 'Account', 'Your ID, subscription and verification')
      + '<div class="card">' + badge(p)
      + '<div class="acct-grid">'
      + '<div><div class="kpi-l">Email</div><div>' + C.esc(p.email) + (p.email_verified ? ' <span class="ok-t">✓ verified</span>' : ' <span class="warn-t">not verified</span>') + '</div></div>'
      + '<div><div class="kpi-l">Phone</div><div>' + C.esc(p.phone || '—') + '</div></div>'
      + '<div><div class="kpi-l">Subscription</div><div>' + (premium ? '<span class="ok-t">PREMIUM</span> · ' + b.daysLeft + ' day' + (b.daysLeft === 1 ? '' : 's') + ' left · until ' + C.esc(new Date(p.premium_until).toLocaleDateString()) : '<span class="warn-t">Free</span> · Scanner, Matches Signal and Accuracy are locked') + '</div></div>'
      + '<div><div class="kpi-l">Member since</div><div>' + C.esc(new Date(p.created_at).toLocaleDateString()) + '</div></div></div>'
      + '<div class="controls" style="margin-top:12px">' + (premium ? '' : '<button type="button" class="btn primary" data-act="upgrade">Upgrade — $' + cfg.priceUsd + '/month</button>') + '<button type="button" class="btn ghost" data-act="logout">Log out</button></div></div>'
      + '<div class="card"><div class="card-head"><h3>Activate premium</h3><div class="sub">enter the 6-digit activation code from your email</div></div>'
      + (approvedClaim && !premium ? '<div class="banner" style="margin-bottom:10px"><div class="banner-title">Your payment was approved</div><div class="banner-body">Check your email for the activation code. If it did not arrive, ask the owner on WhatsApp — they can read it out to you.</div></div>' : '')
      + (pendingClaim ? '<div class="muted small" style="margin-bottom:10px">A payment claim is pending review (' + C.esc(pendingClaim.method) + (pendingClaim.reference ? ' · ' + C.esc(pendingClaim.reference) : '') + '). You will get a code once the owner confirms it.</div>' : '')
      + '<form id="activate-form" class="form"><div class="field-row"><div class="field"><label for="act-code">Activation code</label><input type="text" id="act-code" name="code" inputmode="numeric" maxlength="6" pattern="[0-9]{6}" required placeholder="123456" class="code-input" autocomplete="one-time-code"></div><div class="field" style="align-self:end"><button type="submit" class="btn primary">Activate ' + cfg.premiumDays + ' days</button></div></div></form></div>'
      + (premium ? '' : '<div class="card"><div class="card-head"><h3>Email code not working?</h3></div><p class="intro">The owner can verify you directly from WhatsApp — send your account ID and the owner activates your access from the admin console.</p><a class="btn" href="' + C.esc(root.MS.ui.support ? root.MS.ui.support.verifyLink(p) : cfg.contact.whatsappLink) + '" target="_blank" rel="noopener">Verify via WhatsApp</a></div>')
      + '<div class="card"><div class="card-head"><h3>Contact the owner</h3></div><div class="contact"><a class="btn" href="' + C.esc(cfg.contact.whatsappLink) + '" target="_blank" rel="noopener">WhatsApp ' + C.esc(cfg.contact.whatsapp) + '</a><a class="btn ghost" href="mailto:' + C.esc(cfg.contact.email) + '">' + C.esc(cfg.contact.email) + '</a></div><div class="muted small" style="margin-top:8px">Quote your account ID <span class="mono">' + C.esc(b.id) + '</span> in every message.</div></div>';
    const up = el.querySelector('[data-act="upgrade"]'); if (up) up.addEventListener('click', () => act.navigate('upgrade'));
    el.querySelector('[data-act="logout"]').addEventListener('click', () => act.logout());
    el.querySelector('#activate-form').addEventListener('submit', (e) => { e.preventDefault(); act.activate(el.querySelector('#act-code').value.trim()); });
  }

  root.MS.ui.account = { mount(rootEl, actions) { el = rootEl; act = actions; }, render, badge };
})(typeof globalThis !== 'undefined' ? globalThis : this);

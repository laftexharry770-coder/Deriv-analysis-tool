// matches-sniper/js/ui/support.js — Support page: WhatsApp / email contact, verify-via-WhatsApp, quick answers
(function (root) {
  'use strict';
  const C = root.MS.ui.components, cfg = root.MS.config;
  let el = null, act = null;

  /** wa.me link with a prefilled message asking the owner to verify this account. */
  function verifyLink(profile, email) {
    const id = profile && profile.account_id ? profile.account_id : '';
    const who = email || (profile && profile.email) || '';
    const text = 'Hello, please verify my ' + cfg.brand + ' account' + (id ? ' ' + id : '') + (who ? ' (' + who + ')' : '') + '. I could not receive the email code.';
    return cfg.contact.whatsappLink + '?text=' + encodeURIComponent(text);
  }

  function render(state) {
    if (!el) return;
    const p = state.profile;
    el.innerHTML = C.pageTitle('✆', 'Support', 'Talk to the owner on WhatsApp or email')
      + '<div class="card"><div class="contact"><a class="btn primary" href="' + C.esc(cfg.contact.whatsappLink) + '" target="_blank" rel="noopener">WhatsApp ' + C.esc(cfg.contact.whatsapp) + '</a><a class="btn ghost" href="mailto:' + C.esc(cfg.contact.email) + '">' + C.esc(cfg.contact.email) + '</a></div>'
      + (p ? '<div class="muted small" style="margin-top:8px">Quote your account ID <span class="mono">' + C.esc(p.account_id) + '</span> in every message.</div>' : '') + '</div>'
      + '<div class="card"><div class="card-head"><h3>Email code not arriving?</h3></div><p class="intro">If the verification or activation email does not reach you, the owner can verify your account directly. Send a WhatsApp message with your account ID and the owner will activate you from the admin console.</p>'
      + '<a class="btn" href="' + C.esc(verifyLink(p)) + '" target="_blank" rel="noopener">Verify via WhatsApp</a></div>'
      + '<div class="card"><div class="card-head"><h3>Quick answers</h3></div><dl class="kv">'
      + '<dt>How do I pay?</dt><dd>Open Upgrade, pick Skrill, Trust Wallet (USDT), Binance Pay, bank transfer or the local option for your country, follow the numbered steps, then submit the "I have paid" form with the transaction reference.</dd>'
      + '<dt>How long until I am activated?</dt><dd>As soon as the owner confirms the payment you receive a 6-digit activation code by email (or by WhatsApp). Enter it under Account → Activate premium.</dd>'
      + '<dt>What does PREMIUM include?</dt><dd>The Volatility Scanner, Matches / Differs predictions, the Matches Signal with countdown, the Frequency Graph, the Accuracy tracker and CSV export, for ' + cfg.premiumDays + ' days per payment.</dd>'
      + '<dt>Does the tool place trades?</dt><dd>No. It is signals only — you place every contract yourself on Deriv.</dd></dl></div>';
    if (act && act.noop) act.noop();
  }

  root.MS.ui.support = { mount(rootEl, actions) { el = rootEl; act = actions; }, render, verifyLink };
})(typeof globalThis !== 'undefined' ? globalThis : this);

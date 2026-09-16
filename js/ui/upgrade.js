// matches-sniper/js/ui/upgrade.js — $70/month subscription: method tabs, receiving details, step guides, "I have paid" form
(function (root) {
  'use strict';
  const C = root.MS.ui.components, B = root.MS.billing, cfg = root.MS.config;
  let el = null, act = null, tab = null;

  function tabsHtml(profile) {
    const local = B.localMethodFor(profile && (profile.phone || profile.country_code));
    return '<div class="method-tabs">' + B.METHODS.map(m => '<button type="button" data-tab="' + m.id + '" class="' + (tab === m.id ? 'on' : '') + '">' + C.esc(m.id === 'local' && local ? local.name.split(' /')[0] : m.short) + '</button>').join('') + '</div>';
  }

  function methodPanel(state) {
    const p = state.profile, settings = (state.account && state.account.settings) || {};
    const guide = B.guideFor(tab, { price: cfg.priceUsd, accountId: p.account_id, phone: p.phone, countryCode: p.country_code });
    const det = B.receivingDetails(tab, settings);
    let h = '<div class="method-panel"><h3>' + C.esc(guide.title) + '</h3>' + (guide.fee ? '<div class="muted small">' + C.esc(guide.fee) + '</div>' : '');
    if (!guide.available) return h + '<div class="banner" style="margin-top:10px"><div class="banner-body">' + C.esc(guide.note || 'Not available.') + '</div><div class="banner-actions"><a class="btn primary" href="' + C.esc(cfg.contact.whatsappLink) + '" target="_blank" rel="noopener">WhatsApp the owner</a></div></div></div>';
    h += '<div class="recv"><div class="kpi-l">Send USD ' + cfg.priceUsd + (guide.local && guide.local.currency !== 'USD' ? ' (in ' + C.esc(guide.local.currency) + ' at today\'s rate)' : '') + ' to</div>';
    if (det.lines.length) h += det.lines.map(l => '<div class="recv-line"><span class="recv-l">' + C.esc(l.label) + '</span><span class="recv-v mono" data-copy="' + C.esc(l.value) + '">' + C.esc(l.value) + '</span><button type="button" class="btn ghost small-btn" data-copy-btn="' + C.esc(l.value) + '">Copy</button></div>').join('');
    if (det.missing.length) h += '<div class="warn-t small">The owner has not published ' + C.esc(det.missing.join(', ')) + ' yet — ask on WhatsApp for the details before paying.</div>';
    h += '</div><ol class="steps">' + guide.steps.map(s => '<li>' + C.esc(s) + '</li>').join('') + '</ol></div>';
    return h;
  }

  function claimForm(state) {
    const claims = (state.account && state.account.claims) || [];
    return '<div class="card"><div class="card-head"><h3>I have paid</h3><div class="sub">tell the owner what to look for — you get an email code once it is confirmed</div></div>'
      + '<form id="claim-form" class="form"><input type="hidden" name="method" value="' + C.esc(tab) + '">'
      + '<div class="field-row"><div class="field"><label for="claim-ref">Transaction reference / code</label><input type="text" id="claim-ref" name="reference" maxlength="200" placeholder="e.g. QGH7XK2M9P or TxID" required></div>'
      + '<div class="field"><label for="claim-amount">Amount paid</label><div class="phone-row"><input type="number" id="claim-amount" name="amount" step="0.01" min="0" value="' + cfg.priceUsd + '"><select name="currency" id="claim-currency" aria-label="Currency">' + ['USD', 'USDT', 'KES', 'TZS', 'UGX', 'NGN', 'GHS', 'ZAR', 'RWF', 'ZMW', 'INR', 'GBP', 'EUR'].map(c => '<option>' + c + '</option>').join('') + '</select></div></div></div>'
      + '<div class="field"><label for="claim-note">Note (optional)</label><input type="text" id="claim-note" name="note" maxlength="500" placeholder="sender name / anything that helps"></div>'
      + '<div class="controls"><button type="submit" class="btn primary">Submit payment claim</button><span class="muted small">Method: ' + C.esc((B.methodById(tab) || {}).name || tab) + '</span></div></form>'
      + (claims.length ? '<div style="margin-top:12px"><div class="kpi-l">Your claims</div>' + C.table(['When', 'Method', 'Reference', 'Amount', 'Status'], claims.map(c => [C.esc(new Date(c.created_at).toLocaleString()), C.esc(c.method), C.esc(c.reference || '—'), C.esc((c.amount == null ? '' : c.amount + ' ') + (c.currency || '')), C.pill(c.status.toUpperCase(), c.status === 'approved' ? 'ok' : c.status === 'rejected' ? 'bad' : 'warn') + (c.review_note ? ' <span class="muted small">' + C.esc(c.review_note) + '</span>' : '')])) + '</div>' : '') + '</div>';
  }

  function render(state) {
    if (!el) return;
    const p = state.profile; if (!p) { el.innerHTML = '<h2>Upgrade</h2><div class="card muted">Not signed in.</div>'; return; }
    if (!tab) { tab = B.localMethodFor(p.phone || p.country_code) ? 'local' : 'skrill'; }
    const premium = root.MS.access.isPremium(p);
    el.innerHTML = C.pageTitle('★', 'Upgrade', 'Premium subscription · $' + cfg.priceUsd + ' per month')
      + '<div class="card price-card"><div class="price-row"><div><div class="kpi-l">Premium subscription</div><div class="price">$' + cfg.priceUsd + '<span class="per">/ month</span></div></div><div class="price-feats"><div>✓ Volatility scanner across every index</div><div>✓ MATCHES sniper signals with countdown</div><div>✓ Accuracy tracker and CSV export</div><div>✓ Verified tick beside your account ID</div></div></div>'
      + (premium ? '<div class="ok-t" style="margin-top:8px">You are PREMIUM until ' + C.esc(new Date(p.premium_until).toLocaleDateString()) + '. Paying again adds ' + cfg.premiumDays + ' more days.</div>' : '') + '</div>'
      + '<div class="card"><div class="card-head"><h3>Choose how to pay</h3><div class="sub">the local option is picked from your phone number (' + C.esc(p.phone || '—') + ')</div></div>' + tabsHtml(p) + methodPanel(state) + '</div>'
      + claimForm(state)
      + '<div class="card"><div class="card-head"><h3>How activation works</h3></div><ol class="steps"><li>Pay with any method above and submit the "I have paid" form with the transaction reference.</li><li>The owner checks the payment (WhatsApp ' + C.esc(cfg.contact.whatsapp) + ' if you want to speed it up).</li><li>You receive a 6-digit activation code by email.</li><li>Enter it under Account → Activate premium. Your account ID gets the green tick and PREMIUM for ' + cfg.premiumDays + ' days.</li></ol></div>';
    el.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => { tab = b.getAttribute('data-tab'); render(state); }));
    el.querySelectorAll('[data-copy-btn]').forEach(b => b.addEventListener('click', () => { const v = b.getAttribute('data-copy-btn'); if (root.navigator && root.navigator.clipboard) root.navigator.clipboard.writeText(v).then(() => act.toast('Copied', 'ok'), () => {}); }));
    el.querySelector('#claim-form').addEventListener('submit', (e) => {
      e.preventDefault(); const f = e.target; const v = {}; new FormData(f).forEach((val, k) => { v[k] = String(val).trim(); });
      act.claimPayment({ method: v.method, reference: v.reference, amount: v.amount, currency: v.currency, note: v.note });
    });
  }

  root.MS.ui.upgrade = { mount(rootEl, actions) { el = rootEl; act = actions; }, render, setTab(t) { tab = t; } };
})(typeof globalThis !== 'undefined' ? globalThis : this);

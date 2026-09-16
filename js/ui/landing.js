// matches-sniper/js/ui/landing.js — public / unpaid view (reference recording): hero, automated-pipeline ticker,
// mobile + PC ready, tool accuracy, public access steps, floating support button
(function (root) {
  'use strict';
  const C = root.MS.ui.components, cfg = root.MS.config;
  const STAGES = ['Subscribe to Deriv tick stream', 'Extract last digit at native pip size', 'Build digit frequency table', 'Measure deviation from uniform baseline', 'Score model confidence', 'Estimate win probability', 'Emit prediction'];
  let el = null, act = null, timer = null, stage = 0;

  function tick() {
    stage = (stage + 1) % STAGES.length;
    if (!el) return;
    const n = el.querySelector('#pipe-stage'), l = el.querySelector('#pipe-label'); if (!n || !l) return;
    n.textContent = 'STAGE ' + (stage + 1) + ' OF ' + STAGES.length; l.textContent = '› ' + STAGES[stage];
    el.querySelectorAll('.pipe-dots i').forEach((d, i) => d.classList.toggle('on', i === stage));
    const bar = el.querySelector('.pipe-bar'); if (bar) bar.style.width = ((stage + 1) / STAGES.length * 100).toFixed(0) + '%';
  }

  function render(state) {
    if (!el) return;
    const p = state.profile;
    const primary = p ? (root.MS.access.isPremium(p) ? ['Open the tool', 'open'] : ['Get access — $' + cfg.priceUsd + '/month', 'upgrade']) : ['Access / Login →', 'login'];
    const acc = cfg.statedAccuracy;
    el.innerHTML = '<header class="land-top"><div class="brand"><span class="logo" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22"><rect x="2" y="2" width="20" height="20" rx="5" fill="currentColor"/><path d="M6 14l3-4 3 3 2-5 4 6" stroke="#ffffff" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></span><span>' + C.esc(cfg.brand) + '</span></div>'
      + '<div class="row"><a href="#public-access" class="land-link" data-scroll="public-access">HOW TO ACCESS</a>' + (p ? '<button type="button" class="btn ghost small-btn" data-act="account">My account</button>' : '<button type="button" class="btn ghost small-btn" data-act="login">Log in</button>') + '</div></header>'
      + '<section class="land-hero"><span class="land-eyebrow">⚡ AUTOMATED DIGIT-MARKET ANALYSIS</span><h1>Welcome to the World<br>of <em>Deriv Automation</em></h1>'
      + '<p>The engine connects to the live Deriv tick feed, reads every last digit and scores the market automatically. You pick a market; the analysis runs itself.</p>'
      + '<button type="button" class="btn primary land-cta" data-act="' + primary[1] + '">' + C.esc(primary[0]) + '</button></section>'
      + '<div class="pipe"><div class="pipe-track"><div class="pipe-bar"></div></div><div class="pipe-row"><span class="mod-ic">◎</span><div><div class="pipe-l">AUTOMATED ENGINE</div><div class="pipe-t">FULLY AUTOMATED PIPELINE</div></div><div class="pipe-stage"><div id="pipe-stage">STAGE 1 OF ' + STAGES.length + '</div><div id="pipe-label">› ' + C.esc(STAGES[0]) + '</div></div><div class="pipe-dots">' + STAGES.map((_, i) => '<i class="' + (i === 0 ? 'on' : '') + '"></i>').join('') + '</div></div></div>'
      + '<section class="land-sec"><div class="land-k">WORKS EVERYWHERE</div><h2 class="land-h2">MOBILE + PC READY</h2><p class="muted">Use ' + C.esc(cfg.brand) + ' on your smartphone, tablet or desktop computer. No computer required.</p>'
      + '<div class="land-two"><div class="dev dark"><span class="dev-ic">▯</span><div><b>PHONE &amp; TABLET</b><small>Runs in your mobile browser</small></div></div><div class="dev"><span class="dev-ic">▭</span><div><b>LAPTOP &amp; DESKTOP</b><small>Full-width analysis workspace</small></div></div></div>'
      + '<div class="land-checks"><span>✓ Mobile compatible</span><span>✓ PC compatible</span><span>✓ Responsive interface</span><span>✓ Built for every screen size</span></div></section>'
      + '<section class="land-sec"><div class="land-k">' + (acc ? 'STATED RANGE' : 'MEASURED LIVE') + '</div><h2 class="land-h2">TOOL ACCURACY</h2><div class="land-navy"><div class="land-k light">TOOL ACCURACY</div>'
      + (acc ? '<div class="land-big">' + C.esc(acc) + '</div><p>The tool\'s stated observed accuracy range across analysis conditions. Not a guaranteed win rate.</p>' : '<div class="land-big">Scored on every tick</div><p>Every MATCH or DIFFER call is scored against the real tick that follows it. The Accuracy page shows the true win-rate — overall, per market and per strength band — with nothing painted on.</p>')
      + '<button type="button" class="btn light" data-act="' + (p ? 'accuracy' : 'login') + '">◎ VIEW ACCURACY</button></div></section>'
      + '<section class="land-sec" id="public-access"><div class="land-k">PAID ACCESS</div><h2 class="land-h2">PUBLIC ACCESS</h2><p class="muted">Public access to ' + C.esc(cfg.brand) + ' is available after payment. Complete the access purchase process to receive authorization to use the professional analysis tools.</p>'
      + '<div class="land-steps"><ol><li><b>1</b>Choose a payment method and complete payment</li><li><b>2</b>Submit your payment proof through the official process</li><li><b>3</b>An administrator verifies the payment (email code or WhatsApp)</li><li><b>4</b>Your login is activated — PREMIUM for ' + cfg.premiumDays + ' days</li></ol>'
      + '<button type="button" class="btn primary wide" data-act="' + (p ? 'upgrade' : 'signup') + '">▤ GET ACCESS — $' + cfg.priceUsd + '/month</button><div class="land-fine">The tool is not publicly accessible for free.</div></div></section>'
      + '<footer class="land-foot">WhatsApp <a href="' + C.esc(cfg.contact.whatsappLink) + '" target="_blank" rel="noopener">' + C.esc(cfg.contact.whatsapp) + '</a> · <a href="mailto:' + C.esc(cfg.contact.email) + '">' + C.esc(cfg.contact.email) + '</a> · Signals only — no trades are placed</footer>'
      + '<a class="support-fab" href="' + C.esc(cfg.contact.whatsappLink) + '" target="_blank" rel="noopener">✆ SUPPORT</a>';
    el.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => act.landing(b.getAttribute('data-act'))));
    const s = el.querySelector('[data-scroll]'); if (s) s.addEventListener('click', (e) => { e.preventDefault(); const t = el.querySelector('#public-access'); if (t) t.scrollIntoView({ behavior: 'smooth' }); });
    if (timer == null) timer = root.setInterval(tick, 1700);
  }
  function hide() { if (el) { el.hidden = true; } if (timer != null) { root.clearInterval(timer); timer = null; } }
  function show(state) { if (el) { el.hidden = false; render(state); } }

  root.MS.ui.landing = { mount(rootEl, actions) { el = rootEl; act = actions; }, render, show, hide };
})(typeof globalThis !== 'undefined' ? globalThis : this);

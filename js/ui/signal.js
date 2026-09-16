// matches-sniper/js/ui/signal.js — the live MATCH signal card, countdown, controls, no-setup state, recent signals
(function (root) {
  'use strict';
  const C = root.MS.ui.components;
  const util = root.MS.util;
  let el = null, act = null;

  function outcomePill(s) {
    if (s.outcome === 'win') return C.pill('WIN', 'ok');
    if (s.outcome === 'loss') return C.pill('LOSS', 'bad');
    if (s.status === 'expired') return C.pill('EXPIRED · PENDING', 'warn');
    return C.pill('PENDING', 'warn');
  }

  function card(state) {
    const s = state.signal;
    const sim = state.feedStatus && state.feedStatus.kind === 'sim';
    const cd = state.countdown || { remainingSec: 0, totalSec: s.validFor };
    // the LIVE badge tracks the entry window, not the outcome: a signal that already resolved
    // can still be entered until its countdown reaches zero
    const open = s.status !== 'expired' && cd.remainingSec > 0;
    const cls = ['card', 'signal-card']; if (!open) cls.push('expired'); if (s.outcome) cls.push(s.outcome);
    const gates = s.gates || null;
    return '<div class="' + cls.join(' ') + '"><div class="signal-top"><div class="row">'
      + (open ? '<span class="pill ok live">MATCHES SIGNAL · LIVE</span>' : '<span class="pill warn">MATCHES SIGNAL · EXPIRED</span>')
      + (s.source === 'sim' || sim ? C.pill('SIMULATED', 'sim') : '') + (s.outcome ? outcomePill(s) : '') + '</div><span class="signal-time">' + util.fmtTime(s.issuedAt) + '</span></div>'
      + '<div class="eyebrow-line">RECOMMENDED MATCH</div><div class="signal-mid"><div class="digit-big">' + s.digit + '</div><div><div class="market-name">Trade MATCH ' + s.digit + ' · ' + C.esc(s.market) + '</div><div class="market-sym">' + C.esc(s.symbol) + ' · rank #' + s.rank + ' of ' + s.universeSize + ' · ' + C.esc(s.mode) + ' mode</div>'
      + '<div class="headline" style="margin-top:8px"><div><span class="str-l">Signal strength</span><span class="str-v">' + s.strength.toFixed(1) + '</span></div><div class="prob">appearance rate <b>' + C.pct(s.probEst) + '</b> vs 10% base</div></div></div></div>'
      + C.bandBar(s.strength)
      + '<div class="signal-foot">' + C.countdownRing(cd.remainingSec, cd.totalSec) + '<div><div class="reason"><b>Digit ' + s.digit + ' dominated the last ' + s.window + ' ticks</b> — highest frequency signature detected in the sweep.</div><div class="reason muted">' + C.esc(s.reason) + '</div>'
      + '<div class="meta-line">valid for ' + s.validFor + 's · entry window ' + s.entryWindowTicks + ' ticks × ' + s.tickInterval.toFixed(1) + 's · horizon ' + s.horizonTicks + ' tick' + (s.horizonTicks > 1 ? 's' : '') + '</div>'
      + (s.outcome ? '<div class="meta-line">outcome digit ' + s.resolvedDigit + ' → ' + s.outcome.toUpperCase() + (s.hitWithinWindow != null ? ' · within window: ' + (s.hitWithinWindow ? 'yes' : 'no') : '') + '</div>' : '')
      + '</div></div>' + (gates ? C.gateList(gates) : '') + '</div>';
  }

  function noSetup(state) {
    const r = state.scan && state.scan.result;
    const ranked = r && r.ranked ? r.ranked.slice(0, 3) : [];
    const running = state.scan && state.scan.phase === 'running';
    return '<div class="card"><div class="nosetup"><div class="t">' + (running ? 'SCANNING…' : (r ? 'NO SNIPER SETUP' : 'READY TO SCAN')) + '</div>'
      + '<div class="muted small" style="margin-top:4px">' + (running ? 'ranking every market' : (r ? 'no market passes every gate right now — press Re-scan market to try again' : 'press Re-scan market to rank every volatility index')) + '</div>'
      + (ranked.length ? '<div class="miss">' + ranked.map(e => '<div class="m"><span>' + C.esc(e.name) + ' · hot ' + (e.digit == null ? '–' : e.digit) + '</span><span class="f">✗ ' + C.esc(e.failed.join(', ')) + '</span></div>').join('') + '</div>' : '') + '</div></div>';
  }

  function controls(state) {
    const s = state.settings;
    const running = state.scan && state.scan.phase === 'running';
    return '<div class="card"><div class="controls"><button type="button" class="btn primary" data-act="scan"' + (running ? ' disabled' : '') + '>' + (running ? 'Scanning…' : 'Re-scan market') + '</button>'
      + '<label class="toggle"><input type="checkbox" data-set="sound"' + (s.sound ? ' checked' : '') + '> Sound</label></div></div>';
  }

  function recent(state) {
    const list = (state.signals || []).slice(-12).reverse();
    return '<div class="card"><div class="card-head"><h3>Recent signals</h3><div class="sub">' + (state.signals || []).length + ' total · newest first</div></div>'
      + (list.length ? '<div class="sig-list">' + list.map(s => '<div class="sig-item"><span class="t">' + util.fmtTime(s.issuedAt) + '</span><span>' + C.esc(s.market) + '<br><span class="t">strength ' + s.strength.toFixed(0) + ' · ' + C.esc(s.band) + (s.source === 'sim' ? ' · sim' : '') + '</span></span><span class="d">' + s.digit + '</span>' + outcomePill(s) + '</div>').join('') + '</div>' : '<div class="muted small">No signals yet.</div>') + '</div>';
  }

  function render(state) {
    if (!el) return;
    el.innerHTML = C.pageTitle('◈', 'Matches signal', 'Recommended MATCH entry with validity countdown') + (state.signal ? card(state) : noSetup(state)) + controls(state) + recent(state);
    el.querySelector('[data-act="scan"]').addEventListener('click', () => act.scan({ from: 'signal' }));
    el.querySelectorAll('[data-set]').forEach(inp => inp.addEventListener('change', () => {
      const k = inp.getAttribute('data-set'); const v = inp.type === 'checkbox' ? inp.checked : Number(inp.value);
      act.setSettings({ [k]: v });
    }));
  }

  // cheap partial update for the 10 Hz countdown: replace only the ring
  function renderCountdown(state) {
    if (!el || !state.signal) return;
    const ring = el.querySelector('.ring'); if (!ring) return;
    const cd = state.countdown || { remainingSec: 0, totalSec: state.signal.validFor };
    ring.outerHTML = C.countdownRing(cd.remainingSec, cd.totalSec);
  }

  root.MS.ui.signal = { mount(rootEl, actions) { el = rootEl; act = actions; }, render, renderCountdown };
})(typeof globalThis !== 'undefined' ? globalThis : this);

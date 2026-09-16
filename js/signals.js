// matches-sniper/js/signals.js
(function (root, factory) {
  const mod = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  root.MS = root.MS || {}; root.MS.signals = mod;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  const isNode = typeof require === 'function' && typeof module !== 'undefined';
  const stats = isNode ? require('./stats.js') : root.MS.stats;

  const DEFAULT_SETTINGS = {
    window: 200, recent: 50, mode: 'standard', kappa: 200,
    minSample: 180, minZFull: 1.5, minZRecent: 1.0, recencyGate: true, maxSinceLast: 10,
    maxLagSec: 1.5, cooldownSec: 20,
    entryWindowTicks: 5, horizonTicks: 1,
    autoRescan: false, autoRescanSec: 30, rescanOnExpiry: false, scanAnimMs: 3500, // scans run only when the user presses the button
    payoutMultiple: 8.9,
    appId: '1089', token: '', simulator: false, sound: false,
    activeSymbol: null, accuracySource: 'all'
  };

  function validitySeconds(entryWindowTicks, tickInterval) { return Math.round(entryWindowTicks * tickInterval * 10) / 10; }

  function evaluateMarket(m, settings, nowMs) {
    const st = stats.computeStats(m.ticks, { window: settings.window, recent: settings.recent, mode: settings.mode, kappa: settings.kappa, symbol: m.symbol });
    const d = st.hot;
    const gates = {
      sample:   { pass: st.n >= settings.minSample, value: st.n, need: settings.minSample },
      zFull:    { pass: d != null && st.zFull[d] >= settings.minZFull, value: d == null ? 0 : st.zFull[d], need: settings.minZFull },
      zRecent:  { pass: d != null && st.zRecent[d] >= settings.minZRecent, value: d == null ? 0 : st.zRecent[d], need: settings.minZRecent },
      recency:  { pass: !settings.recencyGate || (d != null && st.sinceLast[d] <= settings.maxSinceLast), value: d == null ? null : st.sinceLast[d], need: settings.maxSinceLast },
      feed:     { pass: !!m.available && !m.stale && (m.lagEma == null || m.lagEma <= settings.maxLagSec), value: m.lagEma, need: settings.maxLagSec },
      cooldown: { pass: nowMs - (m.lastSignalAt || 0) >= settings.cooldownSec * 1000, value: Math.round((nowMs - (m.lastSignalAt || 0)) / 1000), need: settings.cooldownSec }
    };
    const failed = Object.keys(gates).filter(k => !gates[k].pass);
    return { symbol: m.symbol, name: m.name, stats: st, digit: d, gates, pass: failed.length === 0, failed };
  }

  function buildReason(ev, contract) {
    const st = ev.stats;
    const d = contract === 'differs' ? st.cold : ev.digit;
    if (d == null || !st.n) return 'Not enough ticks yet.';
    const pct = (st.counts[d] / st.n * 100).toFixed(1);
    if (contract === 'differs') return 'Digit ' + d + ' appeared only ' + st.counts[d] + '× in the last ' + st.n + ' ticks (' + pct + '%, z ' + st.zFull[d].toFixed(1) + ') and ' + st.countsR[d] + '× in the last ' + st.nR + ' — the least likely digit to repeat.';
    return 'Digit ' + d + ' appeared ' + st.counts[d] + '\u00d7 in the last ' + st.n + ' ticks (' + pct + '%, z ' + st.zFull[d].toFixed(1) + ') and ' + st.countsR[d] + '\u00d7 in the last ' + st.nR + '.';
  }

  /** The Differs counterpart of a market's statistics: the coldest digit and how unlikely it is to appear. */
  function differsView(st) {
    const c = st.cold;
    if (c == null) return null;
    const util = isNode ? require('./util.js') : root.MS.util;
    const strength = 100 * util.normalCdf(-st.zBlend[c]);
    return { digit: c, strength: Math.round(strength * 10) / 10, band: stats.bandFor(strength), probEst: 1 - st.pHat[c], zFull: st.zFull[c], zRecent: st.zRecent[c] };
  }

  function makeSignal(ev, rank, universeSize, settings, nowMs, source) {
    const st = ev.stats, d = ev.digit;
    const validFor = validitySeconds(settings.entryWindowTicks, st.tickInterval);
    return {
      id: nowMs.toString(36) + '-' + ev.symbol, source: source || 'live', issuedAt: nowMs,
      symbol: ev.symbol, market: ev.name, digit: d,
      strength: Math.round(st.strength[d] * 10) / 10, band: st.band[d], probEst: st.pHat[d],
      zFull: st.zFull[d], zRecent: st.zRecent[d], chi2: st.chi2, deviationScore: st.deviationScore,
      rank, universeSize, window: st.n, mode: settings.mode, tickInterval: st.tickInterval,
      entryWindowTicks: settings.entryWindowTicks, validFor, expiresAt: nowMs + validFor * 1000,
      horizonTicks: settings.horizonTicks, reason: buildReason(ev, 'matches'),
      contract: 'matches', differs: differsView(st),
      gates: ev.gates, // snapshot at issue time, so the card never shows a later scan's gate values
      issueEpoch: st.lastEpoch,
      status: 'live', outcome: null, entryEpoch: null, resolvedEpoch: null, resolvedDigit: null, hitWithinWindow: null
    };
  }

  /** A user-requested prediction on one market (Matches / Differs page). Not gated; tracked like any signal. */
  function makeManual(ev, settings, nowMs, source, contract) {
    const s = makeSignal(ev, ev.rank || 1, ev.universeSize || 1, settings, nowMs, source);
    s.manual = true; s.id = 'm-' + s.id;
    if (contract === 'differs') {
      const dv = differsView(ev.stats);
      if (dv) Object.assign(s, { contract: 'differs', digit: dv.digit, strength: dv.strength, band: dv.band, probEst: dv.probEst, zFull: dv.zFull, zRecent: dv.zRecent, reason: buildReason(ev, 'differs') });
    }
    return s;
  }

  function scan(markets, settings, nowMs, source) {
    const ranked = markets.filter(m => m.available && !m.stale)
      .map(m => evaluateMarket(m, settings, nowMs))
      .sort((a, b) => b.stats.deviationScore - a.stats.deviationScore);
    ranked.forEach((e, i) => { e.rank = i + 1; e.universeSize = ranked.length; });
    for (const e of ranked) if (e.pass) return { type: 'signal', signal: makeSignal(e, e.rank, ranked.length, settings, nowMs, source), ranked };
    return { type: 'no-setup', ranked };
  }

  return { DEFAULT_SETTINGS, validitySeconds, evaluateMarket, buildReason, differsView, makeSignal, makeManual, scan };
});

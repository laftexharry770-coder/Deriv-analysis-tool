// matches-sniper/js/signals.js — market evaluation on the live stream, sniper gates, signal objects, the cross-market scan
(function (root, factory) {
  const mod = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  root.MS = root.MS || {}; root.MS.signals = mod;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  const isNode = typeof require === 'function' && typeof module !== 'undefined';
  const stats = isNode ? require('./stats.js') : root.MS.stats;
  const deep = isNode ? require('./deep.js') : root.MS.deep;
  const util = isNode ? require('./util.js') : root.MS.util;

  const DEFAULT_SETTINGS = {
    window: 200, recent: 50, mode: 'standard', proBot: false, kappa: 200,
    // sniper gates: enough live ticks, a real edge on the live engine, the digit seen recently, a live feed, a cooldown
    minSample: 180, minZFull: 2.0, recencyGate: true, maxSinceLast: 10,
    cooldownSec: 20,
    entryWindowTicks: 5, horizonTicks: 1,
    autoRescan: false, autoRescanSec: 30, rescanOnExpiry: false, scanAnimMs: 3500, // scans run only when the user presses the button
    payoutMultiple: 8.9,
    appId: '1089', token: '', simulator: false, sound: false,
    activeSymbol: null, accuracySource: 'all'
  };

  function validitySeconds(entryWindowTicks, tickInterval) { return Math.round(entryWindowTicks * tickInterval * 10) / 10; }

  /**
   * One market on the live stream: chart statistics (window-based, for the pages) plus the real-time engine's
   * per-digit probabilities, the most probable digit and the sniper gates.
   */
  function evaluateMarket(m, settings, nowMs) {
    const st = stats.computeStats(m.ticks, { window: settings.window, recent: settings.recent, mode: settings.mode, kappa: settings.kappa, symbol: m.symbol });
    const dp = deep.analyze(m.ticks, { mode: settings.mode });
    const best = dp.best, d = best ? best.digit : null;
    const gates = {
      sample:   { pass: dp.n >= settings.minSample, value: dp.n, need: settings.minSample },
      edge:     { pass: !!best && best.z >= settings.minZFull, value: best ? best.z : 0, need: settings.minZFull },
      recency:  { pass: !settings.recencyGate || (d != null && dp.sinceLast[d] != null && dp.sinceLast[d] <= settings.maxSinceLast), value: d == null || dp.sinceLast[d] == null ? null : dp.sinceLast[d], need: settings.maxSinceLast },
      feed:     { pass: !!m.available && !m.stale, value: !m.available ? 'unavailable' : (m.stale ? 'stale' : 'live'), need: 'live' },
      cooldown: { pass: nowMs - (m.lastSignalAt || 0) >= settings.cooldownSec * 1000, value: Math.round((nowMs - (m.lastSignalAt || 0)) / 1000), need: settings.cooldownSec }
    };
    const failed = Object.keys(gates).filter(k => !gates[k].pass);
    return { symbol: m.symbol, name: m.name, stats: st, deep: dp, digit: d, prob: best ? best.p : 0.1, z: best ? best.z : 0, gates, pass: failed.length === 0, failed };
  }

  function buildReason(ev, contract) { return deep.explain(ev.deep, contract); }

  /** The Differs counterpart of an evaluation: the least likely next digit and how unlikely it is to appear. */
  function differsView(dp) {
    if (!dp || !dp.worst) return null;
    const w = dp.worst;
    const strength = 100 * util.normalCdf(-w.z);
    return { digit: w.digit, strength: Math.round(strength * 10) / 10, band: deep.bandFor(strength), probEst: 1 - w.p, zFull: -w.z };
  }

  /** Top alternatives for the card: [{ digit, p }] after the pick. */
  function alternatives(dp, count) { return dp && dp.top ? dp.top.slice(1, 1 + (count || 3)).map(e => ({ digit: e.digit, p: e.p })) : []; }

  function makeSignal(ev, rank, universeSize, settings, nowMs, source) {
    const st = ev.stats, dp = ev.deep, best = dp.best, d = ev.digit;
    const validFor = validitySeconds(settings.entryWindowTicks, st.tickInterval);
    return {
      id: nowMs.toString(36) + '-' + ev.symbol, source: source || 'live', issuedAt: nowMs,
      symbol: ev.symbol, market: ev.name, digit: d,
      strength: Math.round(best.strength * 10) / 10, band: best.band, probEst: best.p,
      zFull: best.z, chi2: st.chi2, deviationScore: st.deviationScore,
      rank, universeSize, window: dp.n, nEff: Math.round(dp.nEff), mode: settings.mode, tickInterval: st.tickInterval,
      entryWindowTicks: settings.entryWindowTicks, validFor, expiresAt: nowMs + validFor * 1000,
      horizonTicks: settings.horizonTicks, reason: buildReason(ev, 'matches'),
      contract: 'matches', differs: differsView(dp), alternatives: alternatives(dp, 3),
      lastDigit: dp.lastDigit, transition: dp.nMarkov >= 10 ? dp.pMarkov[d] : null,
      sniper: ev.pass, gates: ev.gates, // snapshot at issue time, so the card never shows a later scan's gate values
      issueEpoch: st.lastEpoch,
      status: 'live', outcome: null, entryEpoch: null, resolvedEpoch: null, resolvedDigit: null, hitWithinWindow: null
    };
  }

  /** A user-requested prediction on one market (Matches / Differs page). Not gated; tracked like any signal. */
  function makeManual(ev, settings, nowMs, source, contract) {
    const s = makeSignal(ev, ev.rank || 1, ev.universeSize || 1, settings, nowMs, source);
    s.manual = true; s.id = 'm-' + s.id;
    if (contract === 'differs') {
      const dv = differsView(ev.deep);
      if (dv) Object.assign(s, { contract: 'differs', digit: dv.digit, strength: dv.strength, band: dv.band, probEst: dv.probEst, zFull: dv.zFull, reason: buildReason(ev, 'differs'), transition: null, alternatives: ev.deep.top.slice(-4, -1).reverse().map(e => ({ digit: e.digit, p: 1 - e.p })) });
    }
    return s;
  }

  /**
   * Scan every market on its live stream. Markets with a live feed and enough ticks are ranked by the edge of their
   * most probable digit. `pick` is always the top of that ranking (the prediction the scanner applies to the app);
   * a MATCHES signal is only issued when the pick also passes every sniper gate.
   */
  function scan(markets, settings, nowMs, source) {
    const evals = markets.map(m => evaluateMarket(m, settings, nowMs));
    const live = e => e.gates.feed.pass && e.gates.sample.pass && e.digit != null;
    evals.sort((a, b) => (live(b) - live(a)) || (b.z - a.z) || (b.deep.n - a.deep.n));
    evals.forEach((e, i) => { e.rank = i + 1; e.universeSize = evals.length; e.eligible = live(e); });
    // the signal goes to the best-ranked market that passes every gate; the pick is that market, or else the top live one
    const first = evals.find(e => live(e) && e.pass) || null;
    const top = first || evals.find(live) || null;
    const pick = top ? { symbol: top.symbol, name: top.name, digit: top.digit, p: top.prob, z: top.z, n: top.deep.n, nEff: Math.round(top.deep.nEff), rank: top.rank, universeSize: evals.length, alternatives: alternatives(top.deep, 3), sniper: top.pass, failed: top.failed, tps: top.stats.tps, chi2: top.stats.chi2 } : null;
    if (top && top.pass) return { type: 'signal', signal: makeSignal(top, top.rank, evals.length, settings, nowMs, source), ranked: evals, pick };
    return { type: 'no-setup', ranked: evals, pick };
  }

  return { DEFAULT_SETTINGS, validitySeconds, evaluateMarket, buildReason, differsView, makeSignal, makeManual, scan };
});

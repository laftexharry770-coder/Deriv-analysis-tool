// matches-sniper/js/deep.js — real-time digit engine (pure; usable from Node and the browser)
//
// Works on the LIVE tick stream of a market: every tick the engine re-estimates how likely each last digit is to
// appear next, pooling two views of the same real data —
//   1. recency-weighted appearance rate: every tick counts, the newest count most (weight e^(-age/tau), age in ticks);
//   2. the transition view: what followed the current last digit so far in the stream (first-order Markov), also
//      recency-weighted;
// both shrunk toward the 10% uniform baseline so a thin sample cannot fake a strong edge. The combined estimate
// gives every digit a probability, an "edge" z-score against 10%, and a ranking. Across markets, the one whose top
// digit carries the strongest, best-supported edge wins the scan. None of this makes a digit certain — the
// Accuracy page scores every call against the real tick that follows.
(function (root, factory) {
  const mod = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  root.MS = root.MS || {}; root.MS.deep = mod;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  const util = (typeof require === 'function' && typeof module !== 'undefined') ? require('./util.js') : root.MS.util;
  const P0 = 0.1;
  const zeros = () => Array(10).fill(0);

  const DEFAULTS = { tau: 500, tauPro: 250, kappa: 40, kappaMarkov: 30, markovCap: 0.35, markovHalf: 120 };

  function bandFor(strength) {
    if (strength >= 95) return 'ELITE';
    if (strength >= 80) return 'HIGH';
    if (strength >= 60) return 'MID';
    return 'LOW';
  }

  function empty() {
    const p = Array(10).fill(P0);
    return { n: 0, nEff: 0, p, z: zeros(), pFreq: p.slice(), pMarkov: p.slice(), lambda: 0, nMarkov: 0, top: [], best: null, worst: null, lastDigit: null, streak: 0, sinceLast: Array(10).fill(null), strength: zeros(), band: Array(10).fill('LOW') };
  }

  /** Per-digit probabilities for the next tick of one market, from its live tick buffer (newest last). */
  function analyze(ticks, opts) {
    opts = Object.assign({}, DEFAULTS, opts || {});
    const n = ticks.length;
    if (!n) return empty();
    const tau = opts.mode === 'pro' ? opts.tauPro : opts.tau;
    // 1. recency-weighted appearance rate
    const wsum = zeros(); let W = 0, W2 = 0;
    for (let i = 0; i < n; i++) { const w = Math.exp(-(n - 1 - i) / tau); wsum[ticks[i].digit] += w; W += w; W2 += w * w; }
    const nEff = W2 ? (W * W) / W2 : 0;
    const pFreq = wsum.map(c => (c + opts.kappa * P0) / (W + opts.kappa));
    // 2. transition view: what followed the current last digit, weighted the same way
    const L = ticks[n - 1].digit;
    const cm = zeros(); let WM = 0, WM2 = 0;
    for (let i = 0; i < n - 1; i++) {
      if (ticks[i].digit !== L) continue;
      const w = Math.exp(-(n - 2 - i) / tau); cm[ticks[i + 1].digit] += w; WM += w; WM2 += w * w;
    }
    const nMarkov = WM2 ? (WM * WM) / WM2 : 0;
    const pMarkov = cm.map(c => (c + opts.kappaMarkov * P0) / (WM + opts.kappaMarkov));
    // 3. pool: the transition view earns weight as its own evidence grows, never more than markovCap
    const lambda = Math.min(opts.markovCap, nMarkov / (nMarkov + opts.markovHalf));
    let p = pFreq.map((v, d) => (1 - lambda) * v + lambda * pMarkov[d]);
    const sum = p.reduce((a, b) => a + b, 0); p = p.map(v => v / sum);
    const nComb = (1 - lambda) * nEff + lambda * nMarkov;
    const se = Math.sqrt(P0 * (1 - P0) / Math.max(1, nComb));
    const z = p.map(v => (v - P0) / se);
    const strength = z.map(v => 100 * util.normalCdf(v));
    const band = strength.map(bandFor);
    // bookkeeping the gates and the reason text need
    const sinceLast = Array(10).fill(null);
    for (let i = n - 1, k = 0; i >= 0; i--, k++) { const d = ticks[i].digit; if (sinceLast[d] == null) sinceLast[d] = k; }
    let streak = 0; for (let i = n - 1; i >= 0 && ticks[i].digit === L; i--) streak++;
    // ranking: probability first, then the digit seen most recently (a tie-break that never invents an edge)
    const top = [];
    for (let d = 0; d < 10; d++) top.push({ digit: d, p: p[d], z: z[d], strength: strength[d], band: band[d], sinceLast: sinceLast[d] == null ? n : sinceLast[d] });
    top.sort((a, b) => b.p - a.p || a.sinceLast - b.sinceLast);
    return { n, nEff: nComb, p, z, pFreq, pMarkov, lambda, nMarkov, top, best: top[0], worst: top[top.length - 1], lastDigit: L, streak, sinceLast, strength, band };
  }

  /**
   * Rank markets by the edge of their most probable digit. Each entry: { symbol, name, deep, digit, p, z, n }.
   * Markets that are unavailable, stale or too thin (n < minSample) are listed last with `eligible: false`.
   */
  function scan(markets, opts) {
    opts = opts || {};
    const minSample = opts.minSample == null ? 180 : opts.minSample;
    const ranked = markets.map(m => {
      const deep = analyze(m.ticks, opts);
      const b = deep.best;
      const eligible = !!m.available && !m.stale && deep.n >= minSample && !!b;
      return { symbol: m.symbol, name: m.name, deep, digit: b ? b.digit : null, p: b ? b.p : P0, z: b ? b.z : 0, n: deep.n, eligible };
    }).sort((a, b) => (b.eligible - a.eligible) || (b.z - a.z) || (b.n - a.n));
    ranked.forEach((e, i) => { e.rank = i + 1; e.universeSize = ranked.length; });
    return { ranked, best: ranked.length && ranked[0].eligible ? ranked[0] : null };
  }

  /** One-line explanation of a pick, for the signal card. */
  function explain(deep, contract) {
    if (!deep || !deep.n || !deep.best) return 'Not enough live ticks yet.';
    const pick = contract === 'differs' ? deep.worst : deep.best;
    const rate = (100 * pick.p).toFixed(1) + '%';
    const trans = deep.nMarkov >= 10 ? ' · after a ' + deep.lastDigit + ' it came ' + (100 * deep.pMarkov[pick.digit]).toFixed(1) + '% of the time' : '';
    if (contract === 'differs') return 'Digit ' + pick.digit + ' is the least likely next digit on the live stream: ' + rate + ' vs 10% base (' + Math.round(deep.nEff) + ' weighted ticks' + trans + ').';
    return 'Digit ' + pick.digit + ' is the most probable next digit on the live stream: ' + rate + ' vs 10% base (' + Math.round(deep.nEff) + ' weighted ticks, edge z ' + pick.z.toFixed(2) + trans + ').';
  }

  return { DEFAULTS, analyze, scan, explain, bandFor };
});

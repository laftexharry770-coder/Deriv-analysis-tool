// matches-sniper/js/stats.js
(function (root, factory) {
  const mod = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  root.MS = root.MS || {}; root.MS.stats = mod;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  const util = (typeof require === 'function' && typeof module !== 'undefined') ? require('./util.js') : root.MS.util;
  const P0 = 0.1;

  function bandFor(strength) {
    if (strength >= 95) return 'ELITE';
    if (strength >= 80) return 'HIGH';
    if (strength >= 60) return 'MID';
    return 'LOW';
  }

  function tickIntervalOf(ticks, symbol) {
    const tail = ticks.slice(-21);
    const diffs = [];
    for (let i = 1; i < tail.length; i++) { const d = tail[i].epoch - tail[i - 1].epoch; if (d > 0) diffs.push(d); }
    if (diffs.length < 3) return util.defaultInterval(symbol || '');
    return Math.max(0.25, util.median(diffs));
  }

  function zeros() { return Array(10).fill(0); }

  function computeStats(ticks, opts) {
    opts = opts || {};
    const W = opts.window || 200, R = opts.recent || 50, mode = opts.mode || 'standard', kappa = opts.kappa == null ? 200 : opts.kappa;
    const w = ticks.slice(-W);
    const n = w.length;
    const counts = zeros(), countsR = zeros();
    for (const t of w) counts[t.digit]++;
    const rw = w.slice(-R); const nR = rw.length;
    for (const t of rw) countsR[t.digit]++;

    // weighted counts (pro: newest 60% weight 2, oldest 40% weight 1)
    const wsum = zeros(); let sumW = 0, sumW2 = 0;
    const cut = Math.floor(n * 0.4);
    for (let i = 0; i < n; i++) { const wt = (mode === 'pro' && i >= cut) ? 2 : 1; wsum[w[i].digit] += wt; sumW += wt; sumW2 += wt * wt; }
    const nEff = sumW ? (sumW * sumW) / sumW2 : 0; // Kish effective sample size

    const freq = zeros(), freqR = zeros(), zFull = zeros(), zRecent = zeros(), zBlend = zeros(), strength = zeros(), pHat = zeros();
    const band = [], cls = [];
    const sdFull = nEff ? Math.sqrt(P0 * (1 - P0) / nEff) : 0;
    const sdR = nR ? Math.sqrt(P0 * (1 - P0) / nR) : 0;
    const aF = mode === 'pro' ? 0.4 : 0.5, aR = 1 - aF;
    for (let d = 0; d < 10; d++) {
      freq[d] = sumW ? wsum[d] / sumW : 0;
      freqR[d] = nR ? countsR[d] / nR : 0;
      zFull[d] = sdFull ? (freq[d] - P0) / sdFull : 0;
      zRecent[d] = sdR ? (freqR[d] - P0) / sdR : 0;
      zBlend[d] = aF * zFull[d] + aR * zRecent[d];
      // strength = how far the digit's appearance rate sits above the 10% baseline (percentile of its z-score)
      strength[d] = 100 * util.normalCdf(zFull[d]);
      band[d] = bandFor(strength[d]);
      // the reference tool's "estimated win probability" is the digit's appearance rate in the sample itself
      pHat[d] = n ? freq[d] : P0;
      cls[d] = zFull[d] >= 1 ? 'above' : (zFull[d] <= -1 ? 'below' : 'normal');
    }
    let chi2 = 0;
    if (n) { const e = n * P0; for (let d = 0; d < 10; d++) chi2 += (counts[d] - e) * (counts[d] - e) / e; }
    const deviationScore = n ? 100 * util.chi2cdf(chi2, 9) : 0;

    const sinceLast = Array(10).fill(n);
    for (let i = n - 1, k = 0; i >= 0; i--, k++) { const d = w[i].digit; if (sinceLast[d] === n) sinceLast[d] = k; }
    // hot = the most frequent digit of the sample (weighted in Pro); a tie goes to the digit seen most recently.
    // cold = the least frequent one; a tie goes to the digit not seen for longest.
    let hot = null, cold = null;
    if (n) {
      hot = 0; cold = 0;
      for (let d = 1; d < 10; d++) {
        if (freq[d] > freq[hot] || (freq[d] === freq[hot] && sinceLast[d] < sinceLast[hot])) hot = d;
        if (freq[d] < freq[cold] || (freq[d] === freq[cold] && sinceLast[d] > sinceLast[cold])) cold = d;
      }
    }
    let currentRun = 0; const lastDigit = n ? w[n - 1].digit : null;
    for (let i = n - 1; i >= 0 && w[i].digit === lastDigit; i--) currentRun++;
    const last5 = w.slice(-5).map(t => t.digit);
    const lastEpoch = n ? w[n - 1].epoch : 0;
    const tickInterval = tickIntervalOf(ticks, opts.symbol);
    const tps = Math.round((1 / tickInterval) * 100) / 100;

    return { n, nEff, counts, freq, countsR, freqR, nR, zFull, zRecent, zBlend, strength, band, pHat, cls, chi2, deviationScore, hot, cold, sinceLast, currentRun, lastDigit, last5, lastEpoch, tickInterval, tps };
  }

  return { computeStats, bandFor, tickIntervalOf, P0 };
});

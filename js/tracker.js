// matches-sniper/js/tracker.js
(function (root, factory) {
  const mod = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  root.MS = root.MS || {}; root.MS.tracker = mod;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  const util = (typeof require === 'function' && typeof module !== 'undefined') ? require('./util.js') : root.MS.util;
  const BANDS = ['LOW', 'MID', 'HIGH', 'ELITE'];

  // Entry tick = first tick strictly after the server epoch the signal was anchored to.
  // Outcome tick = entry + horizonTicks. Window = the entryWindowTicks ticks after entry.
  function resolveSignal(s, ticks) {
    let changed = false;
    let entryIdx = -1;
    for (let i = 0; i < ticks.length; i++) if (ticks[i].epoch > s.issueEpoch) { entryIdx = i; break; }
    if (entryIdx < 0) return false;
    if (s.entryEpoch == null) { s.entryEpoch = ticks[entryIdx].epoch; changed = true; }
    const outIdx = entryIdx + s.horizonTicks;
    if (s.outcome == null && outIdx < ticks.length) {
      const t = ticks[outIdx];
      const hit = t.digit === s.digit; // a Matches call wins on a hit, a Differs call wins on a miss
      s.outcome = (s.contract === 'differs' ? !hit : hit) ? 'win' : 'loss'; s.resolvedEpoch = t.epoch; s.resolvedDigit = t.digit; s.status = 'resolved'; changed = true;
    }
    if (s.hitWithinWindow == null) {
      const end = entryIdx + s.entryWindowTicks;
      const win = ticks.slice(entryIdx + 1, end + 1);
      if (win.some(t => t.digit === s.digit)) { s.hitWithinWindow = true; changed = true; }
      else if (end < ticks.length) { s.hitWithinWindow = false; changed = true; }
    }
    return changed;
  }

  function expireSignal(s, nowMs) { if (s.status === 'live' && nowMs >= s.expiresAt) { s.status = 'expired'; return true; } return false; }

  function rate(list) { const n = list.length; const w = list.filter(s => s.outcome === 'win').length; return n ? w / n : null; }

  function metrics(signals, opts) {
    opts = opts || {}; const src = opts.source || 'all'; const pm = opts.payoutMultiple || 8.9;
    const list = signals.filter(s => src === 'all' || s.source === src);
    const resolved = list.filter(s => s.outcome != null).sort((a, b) => a.issuedAt - b.issuedAt);
    const wins = resolved.filter(s => s.outcome === 'win').length, losses = resolved.length - wins;
    const pending = list.filter(s => s.outcome == null).length;
    const winRate = resolved.length ? wins / resolved.length : null;
    let cur = 0, best = 0, worst = 0;
    for (const s of resolved) { cur = s.outcome === 'win' ? (cur > 0 ? cur + 1 : 1) : (cur < 0 ? cur - 1 : -1); best = Math.max(best, cur); worst = Math.min(worst, cur); }
    const timeline = []; let w = 0; resolved.forEach((s, i) => { if (s.outcome === 'win') w++; timeline.push(w / (i + 1)); });
    const group = (key, keys) => {
      const map = new Map(); (keys || []).forEach(k => map.set(k, []));
      for (const s of resolved) { const k = key(s); if (!map.has(k)) map.set(k, []); map.get(k).push(s); }
      return Array.from(map.entries()).map(([k, arr]) => ({ key: k, n: arr.length, wins: arr.filter(s => s.outcome === 'win').length, winRate: rate(arr) }));
    };
    const perMarket = group(s => s.symbol).map(g => Object.assign(g, { symbol: g.key, market: (resolved.find(s => s.symbol === g.key) || {}).market || g.key }));
    const perBand = group(s => s.band, BANDS).map(g => Object.assign(g, { band: g.key }));
    const perHorizon = group(s => s.horizonTicks).map(g => Object.assign(g, { horizonTicks: g.key }));
    const perContract = group(s => s.contract || 'matches', ['matches', 'differs']).map(g => Object.assign(g, { contract: g.key }));
    const windowKnown = list.filter(s => s.hitWithinWindow != null);
    return {
      total: list.length, wins, losses, pending, winRate, ci: util.wilson(wins, resolved.length), baseline: 0.1,
      edge: winRate == null ? null : winRate - 0.1, breakEven: 1 / (1 + pm),
      rolling20: rate(resolved.slice(-20)), rolling50: rate(resolved.slice(-50)),
      streak: { current: cur, best, worst }, perMarket, perBand, perHorizon, perContract, timeline,
      windowHits: windowKnown.filter(s => s.hitWithinWindow).length, windowTotal: windowKnown.length
    };
  }

  const COLS = ['id', 'source', 'contract', 'manual', 'issuedAt', 'symbol', 'market', 'digit', 'strength', 'band', 'probEst', 'zFull', 'zRecent', 'deviationScore', 'rank', 'universeSize', 'window', 'mode', 'tickInterval', 'validFor', 'horizonTicks', 'status', 'outcome', 'entryEpoch', 'resolvedEpoch', 'resolvedDigit', 'hitWithinWindow', 'reason'];
  function toCSV(signals) {
    const esc = v => { if (v == null) return ''; const s = String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    return COLS.join(',') + '\n' + signals.map(s => COLS.map(c => esc(s[c])).join(',')).join('\n') + '\n';
  }

  return { resolveSignal, expireSignal, metrics, toCSV, BANDS, COLS };
});

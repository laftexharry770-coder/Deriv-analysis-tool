// matches-sniper/js/util.js
(function (root, factory) {
  const mod = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  root.MS = root.MS || {}; root.MS.util = mod;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  function erf(x) { // Abramowitz & Stegun 7.1.26, |err| < 1.5e-7
    const s = x < 0 ? -1 : 1; x = Math.abs(x);
    const t = 1 / (1 + 0.3275911 * x);
    const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
    return s * y;
  }
  function normalCdf(z) { return 0.5 * (1 + erf(z / Math.SQRT2)); }

  function lgamma(x) { // Lanczos g=7
    const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
      -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
    if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
    x -= 1; let a = c[0]; const t = x + 7.5;
    for (let i = 1; i < 9; i++) a += c[i] / (x + i);
    return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
  }
  function gammaP(a, x) { // regularized lower incomplete gamma P(a, x)
    if (x <= 0) return 0;
    if (x < a + 1) {
      let ap = a, sum = 1 / a, del = sum;
      for (let n = 0; n < 1000; n++) { ap += 1; del *= x / ap; sum += del; if (Math.abs(del) < Math.abs(sum) * 1e-15) break; }
      return sum * Math.exp(-x + a * Math.log(x) - lgamma(a));
    }
    let b = x + 1 - a, c = 1 / 1e-300, d = 1 / b, h = d;
    for (let i = 1; i < 1000; i++) {
      const an = -i * (i - a); b += 2;
      d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300;
      c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300;
      d = 1 / d; const del = d * c; h *= del;
      if (Math.abs(del - 1) < 1e-15) break;
    }
    return 1 - Math.exp(-x + a * Math.log(x) - lgamma(a)) * h;
  }
  function chi2cdf(x, k) { return gammaP(k / 2, x / 2); }

  function wilson(wins, n, z) {
    z = z || 1.96;
    if (!n) return { lo: 0, hi: 0 };
    const p = wins / n, z2 = z * z;
    const denom = 1 + z2 / n;
    const centre = (p + z2 / (2 * n)) / denom;
    const half = z * Math.sqrt(p * (1 - p) / n + z2 / (4 * n * n)) / denom;
    return { lo: Math.max(0, centre - half), hi: Math.min(1, centre + half) };
  }

  function lastDigit(quote, pipSize) {
    const s = Number(quote).toFixed(pipSize);
    return s.charCodeAt(s.length - 1) - 48;
  }

  function randomDigit() {
    const c = root.crypto || (typeof require === 'function' ? require('node:crypto').webcrypto : null);
    if (c && c.getRandomValues) {
      const buf = new Uint32Array(1);
      // rejection sampling: keep values below the largest multiple of 10
      const limit = 4294967290;
      for (;;) { c.getRandomValues(buf); if (buf[0] < limit) return buf[0] % 10; }
    }
    return Math.floor(Math.random() * 10);
  }

  function median(arr) {
    if (!arr.length) return 0;
    const a = arr.slice().sort((x, y) => x - y), m = a.length >> 1;
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  }
  const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
  function fmtTime(ms) {
    const d = new Date(ms); const p = (n) => String(n).padStart(2, '0');
    return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  }
  function fmtPct(x, d) { return (x * 100).toFixed(d == null ? 1 : d) + '%'; }
  function defaultInterval(symbol) { return /^1HZ/.test(symbol) ? 1 : 2; }

  class EventBus {
    constructor() { this._h = new Map(); }
    on(evt, fn) { if (!this._h.has(evt)) this._h.set(evt, new Set()); this._h.get(evt).add(fn); return () => this.off(evt, fn); }
    off(evt, fn) { const s = this._h.get(evt); if (s) s.delete(fn); }
    emit(evt, ...args) { const s = this._h.get(evt); if (s) for (const fn of Array.from(s)) fn(...args); }
  }

  return { erf, normalCdf, chi2cdf, gammaP, wilson, lastDigit, randomDigit, median, clamp, fmtTime, fmtPct, defaultInterval, EventBus };
});

const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../js/deep.js');

const mk = (digits, start) => digits.map((d, i) => ({ symbol: 'R_75', epoch: (start || 1000) + i * 2, quote: 1000 + d / 100, digit: d }));
// a deterministic pseudo-random digit stream (a periodic 0..9 pattern would carry a fake transition signal)
function uniform(n, seed) {
  let x = (seed || 12345) >>> 0; const out = [];
  for (let i = 0; i < n; i++) { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; out.push((x >>> 8) % 10); }
  return out;
}

test('empty stream: flat 10% everywhere, nothing to pick', () => {
  const r = D.analyze([]);
  assert.equal(r.n, 0); assert.equal(r.best, null);
  assert.ok(r.p.every(v => Math.abs(v - 0.1) < 1e-12));
});

test('probabilities sum to one and a uniform stream shows no real edge', () => {
  const r = D.analyze(mk(uniform(1000)));
  assert.ok(Math.abs(r.p.reduce((a, b) => a + b, 0) - 1) < 1e-9);
  assert.ok(r.p.every(v => Math.abs(v - 0.1) < 0.03), 'every digit near 10%');
  assert.ok(r.best.z < 2.5, 'no digit stands out far beyond the noise of ten draws: z ' + r.best.z);
  assert.ok(r.nEff > 400 && r.nEff <= 1000);
});

test('a digit that appears more often on the live stream becomes the most probable one, with a positive edge', () => {
  const digits = uniform(1000);
  for (let i = 0; i < 1000; i += 25) digits[i + 1] = 7; // 100 extra sevens spread through the stream
  const r = D.analyze(mk(digits));
  assert.equal(r.best.digit, 7);
  assert.ok(r.best.p > 0.12 && r.best.p < 0.2, 'shrunk appearance rate ' + r.best.p);
  assert.ok(r.best.z > 2, 'edge z ' + r.best.z);
  assert.equal(r.top.length, 10);
  assert.ok(r.top.every((e, i) => i === 0 || e.p <= r.top[i - 1].p), 'ranking is descending');
});

test('recency matters: the same extra digits count more when they are recent, and more still in pro', () => {
  const early = uniform(1000), late = uniform(1000);
  for (let i = 0; i < 300; i += 10) early[i + 3] = 8;      // 30 extra eights long ago
  for (let i = 700; i < 1000; i += 10) late[i + 3] = 8;    // 30 extra eights just now
  const rEarly = D.analyze(mk(early)), rLate = D.analyze(mk(late));
  assert.ok(rLate.p[8] > rEarly.p[8]);
  assert.equal(rLate.best.digit, 8);
  const pro = D.analyze(mk(late), { mode: 'pro' });
  assert.ok(pro.p[8] > rLate.p[8], 'pro weighs the newest ticks more');
});

test('the transition view lifts a digit that keeps following the current last digit', () => {
  // whenever a 4 appears it is followed by a 9 (otherwise the stream is uniform); the stream ends on a 4
  const digits = uniform(1000, 777);
  for (let i = 0; i < 999; i++) if (digits[i] === 4) digits[i + 1] = 9;
  digits[999] = 4;
  const r = D.analyze(mk(digits));
  assert.equal(r.lastDigit, 4);
  assert.ok(r.pMarkov[9] > 0.5, 'transition 4→9 dominates: ' + r.pMarkov[9]);
  assert.equal(r.best.digit, 9);
  assert.ok(r.lambda > 0.1 && r.lambda <= 0.35);
});

test('a thin sample is shrunk toward 10% and cannot fake a strong edge', () => {
  const r = D.analyze(mk([3, 3, 3, 3, 3, 1, 2, 3, 3, 3]));
  assert.equal(r.best.digit, 3);
  assert.ok(r.best.p < 0.3, 'shrunk: ' + r.best.p);
  assert.ok(r.best.z < 2.5, 'edge stays modest on 10 ticks: ' + r.best.z);
});

test('scan ranks markets by the edge of their top digit and skips thin, stale or unavailable ones', () => {
  const hot = uniform(1000); for (let i = 0; i < 1000; i += 20) hot[i + 2] = 5;
  const mild = uniform(1000, 99); for (let i = 0; i < 1000; i += 30) mild[i + 2] = 2; // fewer extras than `hot`
  const markets = [
    { symbol: 'R_10', name: 'Volatility 10 Index', ticks: mk(uniform(1000)), available: true, stale: false },
    { symbol: 'R_75', name: 'Volatility 75 Index', ticks: mk(hot), available: true, stale: false },
    { symbol: 'R_50', name: 'Volatility 50 Index', ticks: mk(mild), available: true, stale: false },
    { symbol: '1HZ10V', name: 'Volatility 10 (1s) Index', ticks: mk(hot), available: true, stale: true },
    { symbol: 'R_100', name: 'Volatility 100 Index', ticks: mk(hot.slice(0, 50)), available: true, stale: false }
  ];
  const r = D.scan(markets, { minSample: 180 });
  assert.equal(r.best.symbol, 'R_75'); assert.equal(r.best.digit, 5); assert.equal(r.best.rank, 1);
  assert.equal(r.ranked[1].symbol, 'R_50');
  assert.ok(r.ranked.slice(0, 3).every(e => e.eligible));
  assert.ok(r.ranked.slice(3).every(e => !e.eligible), 'stale and thin markets go last');
  assert.equal(r.ranked.length, 5); assert.equal(r.ranked[4].universeSize, 5);
});

test('explain names the digit, its rate and the live evidence', () => {
  const digits = uniform(1000); for (let i = 0; i < 1000; i += 25) digits[i + 1] = 7;
  const r = D.analyze(mk(digits));
  assert.match(D.explain(r, 'matches'), /^Digit 7 is the most probable next digit on the live stream: \d+\.\d% vs 10% base/);
  assert.match(D.explain(r, 'differs'), /least likely next digit/);
  assert.equal(D.explain(D.analyze([]), 'matches'), 'Not enough live ticks yet.');
});

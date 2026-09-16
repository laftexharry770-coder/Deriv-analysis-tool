const test = require('node:test');
const assert = require('node:assert/strict');
const stats = require('../js/stats.js');

function mk(digits, interval = 2) { return digits.map((d, i) => ({ epoch: 1000 + i * interval, quote: 100 + d / 100, digit: d })); }
const uniform200 = mk(Array.from({ length: 200 }, (_, i) => i % 10));

test('uniform sample: zero z, chi2 0, all normal', () => {
  const s = stats.computeStats(uniform200, { window: 200, recent: 50 });
  assert.equal(s.n, 200);
  assert.deepEqual(s.counts, Array(10).fill(20));
  for (let d = 0; d < 10; d++) { assert.ok(Math.abs(s.zFull[d]) < 1e-9); assert.equal(s.cls[d], 'normal'); }
  assert.equal(s.chi2, 0);
  assert.equal(s.deviationScore, 0);
  assert.equal(s.lastDigit, 9);
  assert.deepEqual(s.last5, [5, 6, 7, 8, 9]);
  assert.equal(s.tickInterval, 2);
  assert.equal(s.tps, 0.5);
  assert.equal(s.lastEpoch, 1000 + 199 * 2);
});

test('hot digit gets positive z, strength above 50, pHat above 0.1', () => {
  const digits = Array.from({ length: 200 }, (_, i) => (i % 10 === 3 || i % 20 === 4) ? 3 : i % 10); // digit 3 appears 30 times
  const s = stats.computeStats(mk(digits), { window: 200, recent: 50 });
  assert.equal(s.counts[3], 30);
  assert.ok(Math.abs(s.zFull[3] - (30 - 20) / Math.sqrt(200 * 0.09)) < 1e-9);
  assert.equal(s.hot, 3);
  assert.ok(s.strength[3] > 50 && s.strength[3] <= 100);
  assert.ok(Math.abs(s.pHat[3] - (30 + 20) / (200 + 200)) < 1e-9);
  assert.ok(s.chi2 > 0 && s.deviationScore > 0 && s.deviationScore <= 100);
  assert.equal(s.cls[3], 'above');
});

test('recent window, sinceLast, currentRun', () => {
  const digits = Array.from({ length: 100 }, (_, i) => i % 10).concat([7, 7, 7]);
  const s = stats.computeStats(mk(digits), { window: 200, recent: 10 });
  assert.equal(s.n, 103);
  assert.equal(s.nR, 10);
  assert.equal(s.countsR[7], 4); // last 10 = 3 4 5 6 7 8 9 7 7 7
  assert.equal(s.currentRun, 3);
  assert.equal(s.sinceLast[7], 0);
  assert.equal(s.sinceLast[9], 3);
  assert.equal(s.sinceLast[0], 12);
});

test('pro mode weights the newest 60% double', () => {
  const digits = Array(80).fill(1).concat(Array(120).fill(2));
  const std = stats.computeStats(mk(digits), { window: 200, recent: 50, mode: 'standard' });
  const pro = stats.computeStats(mk(digits), { window: 200, recent: 50, mode: 'pro' });
  assert.equal(std.freq[2], 0.6);
  assert.ok(Math.abs(pro.freq[2] - 240 / 320) < 1e-9);
  assert.ok(pro.zFull[2] > 0 && pro.zBlend[2] > std.zBlend[2] - 1e-9);
  assert.ok(pro.nEff < 200 && pro.nEff > 100);
});

test('bandFor thresholds', () => {
  assert.equal(stats.bandFor(59.9), 'LOW');
  assert.equal(stats.bandFor(60), 'MID');
  assert.equal(stats.bandFor(80), 'HIGH');
  assert.equal(stats.bandFor(95), 'ELITE');
});

test('empty and short input do not throw', () => {
  const s = stats.computeStats([], { window: 200, recent: 50, symbol: '1HZ10V' });
  assert.equal(s.n, 0); assert.equal(s.hot, null); assert.equal(s.tickInterval, 1);
  const s2 = stats.computeStats(mk([4]), { window: 200, recent: 50 });
  assert.equal(s2.n, 1); assert.equal(s2.lastDigit, 4);
});

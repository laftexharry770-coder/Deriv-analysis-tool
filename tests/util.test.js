// matches-sniper/tests/util.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const util = require('../js/util.js');

test('normalCdf known values', () => {
  assert.ok(Math.abs(util.normalCdf(0) - 0.5) < 1e-7);
  assert.ok(Math.abs(util.normalCdf(1.96) - 0.9750021) < 1e-5);
  assert.ok(Math.abs(util.normalCdf(-1.96) - 0.0249979) < 1e-5);
});

test('chi2cdf df=9 known values', () => {
  assert.ok(Math.abs(util.chi2cdf(16.919, 9) - 0.95) < 1e-3);
  assert.ok(Math.abs(util.chi2cdf(8.343, 9) - 0.5) < 1e-3);
  assert.equal(util.chi2cdf(0, 9), 0);
});

test('wilson interval', () => {
  const { lo, hi } = util.wilson(10, 100);
  assert.ok(lo > 0.05 && lo < 0.06, `lo=${lo}`);
  assert.ok(hi > 0.17 && hi < 0.18, `hi=${hi}`);
  assert.deepEqual(util.wilson(0, 0), { lo: 0, hi: 0 });
});

test('lastDigit respects pip size', () => {
  assert.equal(util.lastDigit(833.6, 2), 0);
  assert.equal(util.lastDigit(841.36, 2), 6);
  assert.equal(util.lastDigit(9660.78, 2), 8);
  assert.equal(util.lastDigit(1234.5678, 4), 8);
  assert.equal(util.lastDigit(100, 3), 0);
  assert.equal(util.lastDigit('6321.123', 3), 3);
});

test('randomDigit is 0..9', () => {
  for (let i = 0; i < 200; i++) { const d = util.randomDigit(); assert.ok(Number.isInteger(d) && d >= 0 && d <= 9); }
});

test('median, clamp, fmt, defaultInterval', () => {
  assert.equal(util.median([3, 1, 2]), 2);
  assert.equal(util.median([4, 1, 3, 2]), 2.5);
  assert.equal(util.median([]), 0);
  assert.equal(util.clamp(5, 0, 3), 3);
  assert.equal(util.fmtPct(0.1234), '12.3%');
  assert.equal(util.fmtPct(0.1234, 2), '12.34%');
  assert.match(util.fmtTime(Date.UTC(2026, 8, 15, 7, 59, 49)), /^\d\d:\d\d:\d\d$/);
  assert.equal(util.defaultInterval('1HZ100V'), 1);
  assert.equal(util.defaultInterval('R_100'), 2);
});

test('EventBus on/off/emit', () => {
  const bus = new util.EventBus();
  const seen = [];
  const fn = (a, b) => seen.push([a, b]);
  bus.on('x', fn); bus.emit('x', 1, 2); bus.off('x', fn); bus.emit('x', 3, 4);
  assert.deepEqual(seen, [[1, 2]]);
});

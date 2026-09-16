const test = require('node:test');
const assert = require('node:assert/strict');
const { SimFeed, SIM_SYMBOLS } = require('../js/sim.js');
const util = require('../js/util.js');

test('SIM_SYMBOLS covers the 16 known volatility indices with cadence and pip size', () => {
  assert.equal(SIM_SYMBOLS.length, 16);
  for (const s of SIM_SYMBOLS) { assert.equal(s.interval, /^1HZ/.test(s.symbol) ? 1 : 2); assert.ok([2, 3, 4].includes(s.pipSize)); assert.match(s.name, /^Volatility \d+( \(1s\))? Index$/); }
});

test('nextTick keeps pip precision and uniform-ish digits', () => {
  const f = new SimFeed({ now: () => 1_000_000 });
  const counts = Array(10).fill(0);
  let last = null;
  for (let i = 0; i < 2000; i++) { const t = f.nextTick('R_100', 1000 + i * 2); assert.equal(t.pipSize, 2); assert.equal(t.epoch, 1000 + i * 2); counts[util.lastDigit(t.quote, 2)]++; if (last != null) assert.ok(Math.abs(t.quote - last) < 50); last = t.quote; }
  for (const c of counts) assert.ok(c > 120 && c < 280, `digit count ${c}`);
  const r10 = f.nextTick('R_10', 5); assert.equal(r10.pipSize, 3); assert.equal(Number(r10.quote.toFixed(3)), r10.quote);
});

test('start emits status, universe, history for every symbol, then ticks on schedule', () => {
  const timers = []; let now = 2_000_000;
  const f = new SimFeed({ now: () => now, setTimeout: (fn, ms) => { timers.push({ fn, at: now + ms }); return timers.length; }, clearTimeout: () => {} });
  const ev = [];
  for (const e of ['status', 'universe', 'history', 'tick']) f.on(e, (p) => ev.push([e, p]));
  f.start();
  assert.deepEqual(ev[0], ['status', { state: 'online', kind: 'sim' }]);
  assert.equal(ev[1][0], 'universe'); assert.equal(ev[1][1].length, SIM_SYMBOLS.length);
  const hist = ev.filter(e => e[0] === 'history'); assert.equal(hist.length, SIM_SYMBOLS.length);
  assert.equal(hist[0][1].prices.length, 250); assert.equal(hist[0][1].times.length, 250);
  assert.ok(hist[0][1].times[249] <= now / 1000);
  assert.equal(timers.length, SIM_SYMBOLS.length);
  now += 1000; timers.filter(t => t.at <= now).forEach(t => t.fn());
  const ticks = ev.filter(e => e[0] === 'tick');
  assert.ok(ticks.length >= SIM_SYMBOLS.filter(s => s.interval === 1).length);
  assert.ok(ticks.every(t => t[1].epoch >= now / 1000 - 1));
  f.stop();
  assert.deepEqual(ev[ev.length - 1], ['status', { state: 'offline', kind: 'sim' }]);
});

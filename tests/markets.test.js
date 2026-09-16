const test = require('node:test');
const assert = require('node:assert/strict');
const { MarketBook } = require('../js/markets.js');

test('universe, history, ticks, digits, cap', () => {
  const b = new MarketBook({ cap: 5 });
  b.setUniverse([{ symbol: 'R_100', name: 'Volatility 100 Index' }, { symbol: '1HZ10V', name: 'Volatility 10 (1s) Index' }]);
  assert.deepEqual(b.all().map(m => m.symbol), ['R_100', '1HZ10V']);
  b.addHistory('R_100', [841.3, 841.36, 841.4], [100, 102, 104], 2);
  assert.deepEqual(b.get('R_100').ticks.map(t => t.digit), [0, 6, 0]);
  assert.equal(b.get('R_100').pipSize, 2);
  for (let i = 0; i < 5; i++) b.addTick({ symbol: 'R_100', epoch: 106 + 2 * i, quote: 841.31 + i / 100, pipSize: 2 }, (106 + 2 * i) * 1000);
  assert.equal(b.get('R_100').ticks.length, 5);
  assert.equal(b.get('R_100').ticks[4].epoch, 114);
});

test('staleness', () => {
  const b = new MarketBook();
  b.setUniverse([{ symbol: '1HZ10V', name: 'Volatility 10 (1s) Index' }]);
  b.addTick({ symbol: '1HZ10V', epoch: 100, quote: 9660.78, pipSize: 2 }, 100_400);
  b.addTick({ symbol: '1HZ10V', epoch: 101, quote: 9660.79, pipSize: 2 }, 101_800);
  assert.equal(b.get('1HZ10V').lastTickMs, 101_800);
  assert.equal(b.isStale('1HZ10V', 101_800 + 4000), false);
  assert.equal(b.isStale('1HZ10V', 101_800 + 5001), true);
  b.refreshStale(101_800 + 5001);
  assert.equal(b.get('1HZ10V').stale, true);
});

test('duplicate / out-of-order ticks are dropped', () => {
  const b = new MarketBook();
  b.setUniverse([{ symbol: 'R_10', name: 'Volatility 10 Index' }]);
  assert.ok(b.addTick({ symbol: 'R_10', epoch: 10, quote: 6321.123, pipSize: 3 }, 10_000));
  assert.equal(b.addTick({ symbol: 'R_10', epoch: 10, quote: 6321.124, pipSize: 3 }, 10_100), null);
  assert.equal(b.addTick({ symbol: 'R_10', epoch: 9, quote: 6321.125, pipSize: 3 }, 10_200), null);
  assert.equal(b.get('R_10').ticks.length, 1);
});

test('unknown symbol tick is ignored; unavailable flag; setUniverse keeps buffers', () => {
  const b = new MarketBook();
  b.setUniverse([{ symbol: 'R_10', name: 'Volatility 10 Index' }]);
  assert.equal(b.addTick({ symbol: 'R_25', epoch: 1, quote: 1, pipSize: 3 }, 1000), null);
  b.markUnavailable('R_10', 'InvalidSymbol');
  assert.equal(b.get('R_10').available, false);
  assert.equal(b.get('R_10').unavailableReason, 'InvalidSymbol');
  b.addHistory('R_10', [1.001], [5], 3);
  assert.equal(b.get('R_10').available, true);
  b.setUniverse([{ symbol: 'R_10', name: 'Volatility 10 Index' }, { symbol: 'R_25', name: 'Volatility 25 Index' }]);
  assert.equal(b.get('R_10').ticks.length, 1);
  assert.equal(b.all().length, 2);
});

test('history-only market is judged by its newest epoch until the first live tick', () => {
  const b = new MarketBook();
  b.setUniverse([{ symbol: 'R_100', name: 'Volatility 100 Index' }]);
  assert.equal(b.isStale('R_100', 1000), true);
  b.addHistory('R_100', [841.3, 841.36], [100, 102], 2);
  assert.equal(b.isStale('R_100', 104_000), false);
  assert.equal(b.isStale('R_100', 102_000 + 10_001), true);
});

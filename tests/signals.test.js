const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../js/signals.js');

function mk(digits, interval = 2, start = 1000) { return digits.map((d, i) => ({ epoch: start + i * interval, quote: 100 + d / 100, digit: d })); }
function market(symbol, digits, extra) {
  return Object.assign({ symbol, name: symbol, ticks: mk(digits, /^1HZ/.test(symbol) ? 1 : 2), available: true, stale: false, lagEma: 0.3, lastSignalAt: 0 }, extra || {});
}
// digit 7 hot: 40 of 200 overall and 11 of last 50, last tick is 7
const hotDigits = (() => { const a = []; for (let i = 0; i < 200; i++) a.push(i % 10); for (let i = 0; i < 14; i++) a[i * 10 + 3] = 7; for (let i = 150; i < 200; i += 10) a[i + 1] = 7; a[199] = 7; return a; })();
const flat = Array.from({ length: 200 }, (_, i) => i % 10);
const NOW = (1000 + 199 * 2) * 1000 + 500;

test('DEFAULT_SETTINGS values', () => {
  assert.equal(S.DEFAULT_SETTINGS.window, 200); assert.equal(S.DEFAULT_SETTINGS.minZFull, 1.5);
  assert.equal(S.DEFAULT_SETTINGS.entryWindowTicks, 5); assert.equal(S.DEFAULT_SETTINGS.horizonTicks, 1);
});

test('validitySeconds', () => { assert.equal(S.validitySeconds(5, 2), 10); assert.equal(S.validitySeconds(5, 1), 5); });

test('hot market passes all gates and produces a signal', () => {
  const r = S.scan([market('R_100', flat), market('R_75', hotDigits)], S.DEFAULT_SETTINGS, NOW);
  assert.equal(r.type, 'signal');
  const sig = r.signal;
  assert.equal(sig.symbol, 'R_75'); assert.equal(sig.digit, 7); assert.equal(sig.rank, 1); assert.equal(sig.universeSize, 2);
  assert.equal(sig.validFor, 10); assert.equal(sig.expiresAt, NOW + 10_000);
  assert.equal(sig.issueEpoch, 1000 + 199 * 2);
  assert.equal(sig.status, 'live'); assert.equal(sig.outcome, null); assert.equal(sig.horizonTicks, 1);
  assert.ok(sig.strength > 80 && sig.strength <= 100);
  assert.ok(sig.probEst > 0.1 && sig.probEst < 0.2);
  assert.match(sig.reason, /Digit 7 appeared 40× in the last 200 ticks/);
  assert.equal(r.ranked[0].symbol, 'R_75');
  assert.equal(sig.source, 'live');
});

test('each gate blocks independently', () => {
  const base = () => market('R_75', hotDigits);
  const s = S.DEFAULT_SETTINGS;
  assert.equal(S.evaluateMarket(base(), s, NOW).pass, true);
  assert.equal(S.evaluateMarket(market('R_75', hotDigits.slice(-100)), s, NOW).gates.sample.pass, false);
  assert.equal(S.evaluateMarket(base(), Object.assign({}, s, { minZFull: 9 }), NOW).gates.zFull.pass, false);
  assert.equal(S.evaluateMarket(base(), Object.assign({}, s, { minZRecent: 9 }), NOW).gates.zRecent.pass, false);
  const late = base(); late.ticks = late.ticks.concat(mk([1, 2, 3, 4, 5, 6, 8, 9, 0, 1, 2, 3], 2, 1000 + 200 * 2));
  assert.equal(S.evaluateMarket(late, s, NOW).gates.recency.pass, false);
  assert.equal(S.evaluateMarket(late, Object.assign({}, s, { recencyGate: false }), NOW).gates.recency.pass, true);
  assert.equal(S.evaluateMarket(market('R_75', hotDigits, { lagEma: 3 }), s, NOW).gates.feed.pass, false);
  assert.equal(S.evaluateMarket(market('R_75', hotDigits, { stale: true }), s, NOW).gates.feed.pass, false);
  assert.equal(S.evaluateMarket(market('R_75', hotDigits, { lastSignalAt: NOW - 5000 }), s, NOW).gates.cooldown.pass, false);
});

test('no setup when nothing passes; unavailable/stale excluded from ranking', () => {
  const r = S.scan([market('R_100', flat), market('R_50', flat, { available: false }), market('R_25', flat, { stale: true })], S.DEFAULT_SETTINGS, NOW);
  assert.equal(r.type, 'no-setup');
  assert.deepEqual(r.ranked.map(e => e.symbol), ['R_100']);
  assert.ok(r.ranked[0].failed.includes('zFull'));
});

test('sim source tag and empty universe', () => {
  const r = S.scan([market('R_75', hotDigits)], S.DEFAULT_SETTINGS, NOW, 'sim');
  assert.equal(r.signal.source, 'sim');
  assert.equal(S.scan([], S.DEFAULT_SETTINGS, NOW).type, 'no-setup');
});

test('signals carry the differs counterpart and manual predictions work for both contracts', () => {
  const r = S.scan([market('R_75', hotDigits)], S.DEFAULT_SETTINGS, NOW);
  const sig = r.signal;
  assert.equal(sig.contract, 'matches');
  assert.ok(sig.differs && sig.differs.digit !== sig.digit, 'differs digit is the cold digit');
  assert.ok(sig.differs.strength > 50 && sig.differs.probEst > 0.8 && sig.differs.probEst < 1);
  const ev = S.evaluateMarket(market('R_75', hotDigits), S.DEFAULT_SETTINGS, NOW);
  const m = S.makeManual(ev, S.DEFAULT_SETTINGS, NOW, 'sim', 'matches');
  assert.equal(m.contract, 'matches'); assert.equal(m.digit, 7); assert.equal(m.manual, true); assert.equal(m.source, 'sim');
  const d = S.makeManual(ev, S.DEFAULT_SETTINGS, NOW, 'sim', 'differs');
  assert.equal(d.contract, 'differs'); assert.equal(d.digit, ev.stats.cold); assert.ok(d.probEst > 0.8);
  assert.match(d.reason, /Digit \d appeared only/);
});

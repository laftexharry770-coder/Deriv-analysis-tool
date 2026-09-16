const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../js/signals.js');

function mk(digits, interval = 2, start = 1000) { return digits.map((d, i) => ({ epoch: start + i * interval, quote: 100 + d / 100, digit: d })); }
function market(symbol, digits, extra) {
  return Object.assign({ symbol, name: symbol, ticks: mk(digits, /^1HZ/.test(symbol) ? 1 : 2), available: true, stale: false, lastSignalAt: 0 }, extra || {});
}
// a deterministic pseudo-random stream (a periodic 0..9 pattern would carry a fake transition signal)
function rnd(n, seed) { let x = (seed || 12345) >>> 0; const out = []; for (let i = 0; i < n; i++) { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; out.push((x >>> 8) % 10); } return out; }
// digit 7 hot on the live stream: ~50 extra sevens through 400 ticks, several in the newest 20, last tick is 7
const hotDigits = (() => { const a = rnd(400, 5); for (let i = 0; i < 400; i += 8) a[i + 3] = 7; a[399] = 7; return a; })();
const flat = rnd(400, 9);
const NOW = (1000 + 399 * 2) * 1000 + 500;

test('DEFAULT_SETTINGS values', () => {
  assert.equal(S.DEFAULT_SETTINGS.window, 200); assert.equal(S.DEFAULT_SETTINGS.minZFull, 2.0);
  assert.equal(S.DEFAULT_SETTINGS.entryWindowTicks, 5); assert.equal(S.DEFAULT_SETTINGS.horizonTicks, 1);
});

test('validitySeconds', () => { assert.equal(S.validitySeconds(5, 2), 10); assert.equal(S.validitySeconds(5, 1), 5); });

test('hot market passes all gates and produces a signal', () => {
  const r = S.scan([market('R_100', flat), market('R_75', hotDigits)], S.DEFAULT_SETTINGS, NOW);
  assert.equal(r.type, 'signal');
  const sig = r.signal;
  assert.equal(sig.symbol, 'R_75'); assert.equal(sig.digit, 7); assert.equal(sig.rank, 1); assert.equal(sig.universeSize, 2);
  assert.equal(sig.validFor, 10); assert.equal(sig.expiresAt, NOW + 10_000);
  assert.equal(sig.issueEpoch, 1000 + 399 * 2);
  assert.equal(sig.status, 'live'); assert.equal(sig.outcome, null); assert.equal(sig.horizonTicks, 1);
  assert.ok(sig.strength > 95 && sig.strength <= 100);
  assert.ok(sig.probEst > 0.15 && sig.probEst < 0.3, 'live-engine probability of the top digit: ' + sig.probEst);
  assert.match(sig.reason, /^Digit 7 is the most probable next digit on the live stream/);
  assert.equal(sig.sniper, true); assert.equal(sig.alternatives.length, 3); assert.ok(sig.nEff > 100);
  assert.deepEqual(r.pick && [r.pick.symbol, r.pick.digit, r.pick.sniper], ['R_75', 7, true]);
  assert.equal(r.ranked[0].symbol, 'R_75');
  assert.equal(sig.source, 'live');
});

test('each gate blocks independently', () => {
  const base = () => market('R_75', hotDigits);
  const s = S.DEFAULT_SETTINGS;
  assert.equal(S.evaluateMarket(base(), s, NOW).pass, true);
  assert.equal(S.evaluateMarket(market('R_75', hotDigits.slice(-100)), s, NOW).gates.sample.pass, false);
  assert.equal(S.evaluateMarket(base(), Object.assign({}, s, { minZFull: 9 }), NOW).gates.edge.pass, false);
  const late = base(); late.ticks = late.ticks.concat(mk([1, 2, 3, 4, 5, 6, 8, 9, 0, 1, 2, 3], 2, 1000 + 400 * 2));
  assert.equal(S.evaluateMarket(late, s, NOW).gates.recency.pass, false);
  assert.equal(S.evaluateMarket(late, Object.assign({}, s, { recencyGate: false }), NOW).gates.recency.pass, true);
  assert.equal(S.evaluateMarket(market('R_75', hotDigits, { available: false }), s, NOW).gates.feed.pass, false);
  assert.equal(S.evaluateMarket(market('R_75', hotDigits, { stale: true }), s, NOW).gates.feed.pass, false);
  assert.equal(S.evaluateMarket(market('R_75', hotDigits, { lastSignalAt: NOW - 5000 }), s, NOW).gates.cooldown.pass, false);
});

test('no setup when nothing passes; unavailable/stale excluded from ranking', () => {
  const r = S.scan([market('R_100', flat), market('R_50', flat, { available: false }), market('R_25', flat, { stale: true })], S.DEFAULT_SETTINGS, NOW);
  assert.equal(r.type, 'no-setup');
  assert.deepEqual(r.ranked.map(e => e.symbol), ['R_100', 'R_50', 'R_25'], 'every market is listed, live ones first');
  assert.deepEqual(r.ranked.map(e => e.eligible), [true, false, false]);
  assert.ok(r.ranked[0].failed.includes('edge'));
  // the scanner still hands out the most probable digit of the top live market, flagged as not a sniper entry
  assert.equal(r.pick.symbol, 'R_100'); assert.equal(r.pick.sniper, false); assert.ok(r.pick.failed.includes('edge'));
  assert.equal(S.scan([market('R_50', flat, { available: false })], S.DEFAULT_SETTINGS, NOW).pick, null);
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
  assert.equal(d.contract, 'differs'); assert.equal(d.digit, ev.deep.worst.digit); assert.ok(d.probEst > 0.8);
  assert.match(d.reason, /least likely next digit/);
  assert.equal(d.alternatives.length, 3); assert.ok(d.alternatives.every(x => x.p > 0.8));
});

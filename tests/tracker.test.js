const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../js/tracker.js');

const mk = (digits, start = 100) => digits.map((d, i) => ({ epoch: start + i, quote: 1, digit: d }));
function sig(over) { return Object.assign({ id: 's1', source: 'live', issuedAt: 105_500, symbol: 'R_100', market: 'Volatility 100 Index', digit: 7, strength: 90, band: 'HIGH', probEst: 0.13, issueEpoch: 105, horizonTicks: 1, entryWindowTicks: 3, validFor: 6, expiresAt: 111_500, status: 'live', outcome: null, entryEpoch: null, resolvedEpoch: null, resolvedDigit: null, hitWithinWindow: null }, over); }

test('pending until entry+horizon exists', () => {
  const s = sig(); const ticks = mk([1, 2, 3, 4, 5, 6]); // epochs 100..105, none after issueEpoch
  assert.equal(T.resolveSignal(s, ticks), false); assert.equal(s.outcome, null);
  ticks.push({ epoch: 106, quote: 1, digit: 9 }); // entry tick
  assert.equal(T.resolveSignal(s, ticks), true); assert.equal(s.entryEpoch, 106); assert.equal(s.outcome, null);
  ticks.push({ epoch: 107, quote: 1, digit: 7 }); // outcome tick (horizon 1)
  assert.equal(T.resolveSignal(s, ticks), true);
  assert.equal(s.outcome, 'win'); assert.equal(s.resolvedEpoch, 107); assert.equal(s.resolvedDigit, 7); assert.equal(s.status, 'resolved');
  assert.equal(s.hitWithinWindow, true);
});

test('loss and window miss; horizon 3', () => {
  const s = sig({ horizonTicks: 3 });
  const ticks = mk([1, 2, 3, 4, 5, 6, 0, 1, 2, 3, 4]); // 106=0 entry, 107=1, 108=2, 109=3 outcome
  T.resolveSignal(s, ticks);
  assert.equal(s.outcome, 'loss'); assert.equal(s.resolvedEpoch, 109); assert.equal(s.hitWithinWindow, false);
});

test('expireSignal only affects live signals', () => {
  const s = sig(); assert.equal(T.expireSignal(s, 111_499), false); assert.equal(T.expireSignal(s, 111_500), true); assert.equal(s.status, 'expired');
  const r = sig({ status: 'resolved', outcome: 'win' }); assert.equal(T.expireSignal(r, 999_999), false); assert.equal(r.status, 'resolved');
});

test('metrics', () => {
  const list = [
    sig({ id: 'a', outcome: 'win', status: 'resolved', band: 'HIGH', symbol: 'R_100', hitWithinWindow: true, issuedAt: 1 }),
    sig({ id: 'b', outcome: 'loss', status: 'resolved', band: 'HIGH', symbol: 'R_100', hitWithinWindow: false, issuedAt: 2 }),
    sig({ id: 'c', outcome: 'loss', status: 'resolved', band: 'ELITE', symbol: '1HZ10V', market: 'Volatility 10 (1s) Index', hitWithinWindow: true, issuedAt: 3 }),
    sig({ id: 'd', outcome: null, status: 'live', issuedAt: 4 }),
    sig({ id: 'e', outcome: 'win', status: 'resolved', source: 'sim', issuedAt: 5 })
  ];
  const m = T.metrics(list, { payoutMultiple: 8.9, source: 'live' });
  assert.equal(m.total, 4); assert.equal(m.wins, 1); assert.equal(m.losses, 2); assert.equal(m.pending, 1);
  assert.ok(Math.abs(m.winRate - 1 / 3) < 1e-9);
  assert.ok(Math.abs(m.breakEven - 1 / 9.9) < 1e-9);
  assert.ok(Math.abs(m.edge - (1 / 3 - 0.1)) < 1e-9);
  assert.equal(m.perMarket.find(x => x.symbol === 'R_100').wins, 1);
  assert.equal(m.perBand.find(x => x.band === 'ELITE').n, 1);
  assert.equal(m.perBand.length, 4);
  assert.equal(m.streak.current, -2); assert.equal(m.streak.best, 1); assert.equal(m.streak.worst, -2);
  assert.deepEqual(m.timeline.map(x => Math.round(x * 100)), [100, 50, 33]);
  assert.equal(m.windowHits, 2); assert.equal(m.windowTotal, 3);
  assert.ok(m.ci.lo >= 0 && m.ci.hi <= 1 && m.ci.lo < m.winRate && m.ci.hi > m.winRate);
  const all = T.metrics(list, { payoutMultiple: 8.9, source: 'all' }); assert.equal(all.total, 5);
  const empty = T.metrics([], {}); assert.equal(empty.winRate, null); assert.equal(empty.total, 0);
});

test('toCSV has header and one row per signal', () => {
  const csv = T.toCSV([sig({ outcome: 'win', reason: 'a "quoted", reason' })]);
  const lines = csv.trim().split('\n');
  assert.equal(lines.length, 2);
  assert.match(lines[0], /^id,source,contract,manual,issuedAt,symbol,market,digit,strength,band,probEst/);
  assert.match(lines[1], /^s1,live,/);
  assert.match(lines[1], /"a ""quoted"", reason"$/);
});

test('differs contract wins when the outcome digit does NOT match; metrics group per contract', () => {
  const s = sig({ contract: 'differs', digit: 7 });
  const ticks = mk([1, 2, 3, 4, 5, 6, 0, 3]); // entry 106=0, outcome 107=3 ≠ 7 → win
  T.resolveSignal(s, ticks);
  assert.equal(s.outcome, 'win');
  const s2 = sig({ contract: 'differs', digit: 3 });
  T.resolveSignal(s2, ticks);
  assert.equal(s2.outcome, 'loss');
  const m = T.metrics([s, s2, sig({ outcome: 'win', status: 'resolved' })], { source: 'all' });
  assert.deepEqual(m.perContract.map(g => [g.contract, g.n, g.wins]), [['matches', 1, 1], ['differs', 2, 1]]);
});

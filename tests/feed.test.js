const test = require('node:test');
const assert = require('node:assert/strict');
const { DerivFeed, STATIC_SYMBOLS, pipDigits } = require('../js/feed.js');

class FakeWS {
  constructor(url) { this.url = url; this.sent = []; FakeWS.last = this; this.readyState = 0; }
  send(s) { this.sent.push(JSON.parse(s)); }
  close() { this.readyState = 3; if (this.onclose) this.onclose({ code: 1000 }); }
  open() { this.readyState = 1; this.onopen(); }
  recv(obj) { this.onmessage({ data: JSON.stringify(obj) }); }
}
function harness(settings) {
  const timers = []; let now = 5_000_000;
  const f = new DerivFeed(settings, { WebSocket: FakeWS, now: () => now, setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimeout: () => {} });
  const ev = []; for (const e of ['status', 'universe', 'universe-empty', 'history', 'tick', 'symbol-error', 'latency', 'error']) f.on(e, p => ev.push([e, p]));
  return { f, ev, timers, flush: () => { const t = timers.splice(0).filter(x => x.ms < 30000); t.forEach(x => x.fn()); } };
}
const SYMS = [
  { symbol: 'R_100', display_name: 'Volatility 100 Index', market: 'synthetic_index', pip: 0.01 },
  { symbol: '1HZ10V', display_name: 'Volatility 10 (1s) Index', market: 'synthetic_index', pip: 0.01 },
  { symbol: 'R_10', display_name: 'Volatility 10 Index', market: 'synthetic_index', pip: 0.001 },
  { symbol: 'BOOM1000', display_name: 'Boom 1000 Index', market: 'synthetic_index', pip: 0.01 },
  { symbol: 'frxEURUSD', display_name: 'EUR/USD', market: 'forex', pip: 0.00001 }
];

test('pipDigits', () => { assert.equal(pipDigits(0.001), 3); assert.equal(pipDigits(0.01), 2); assert.equal(pipDigits(1), 0); assert.equal(pipDigits(null), null); assert.equal(pipDigits('0.0001'), 4); });

test('discovers, filters, sorts and subscribes volatility symbols', () => {
  const { f, ev, flush } = harness({ appId: '1089', token: '' });
  f.start(); const ws = FakeWS.last; assert.equal(ws.url, 'wss://api.derivws.com/trading/v1/options/ws/public');
  ws.open();
  assert.ok(ws.sent.some(m => m.time === 1)); assert.ok(ws.sent.some(m => m.active_symbols === 'brief' && m.product_type === undefined));
  ws.recv({ msg_type: 'active_symbols', active_symbols: SYMS, req_id: 3 });
  const uni = ev.find(e => e[0] === 'universe')[1];
  assert.deepEqual(uni.map(s => s.symbol), ['R_10', '1HZ10V', 'R_100']);
  assert.equal(uni[0].pipSize, 3);
  flush();
  const subs = ws.sent.filter(m => m.ticks_history); assert.equal(subs.length, 3); assert.equal(subs[0].count, 1000); // the public socket's maximum: the live engine starts with depth assert.equal(subs[0].subscribe, 1); assert.equal(subs[0].style, 'ticks');
  ws.recv({ msg_type: 'history', echo_req: { ticks_history: 'R_100' }, history: { prices: ['841.3', 841.36], times: [1, 3] }, pip_size: 2, subscription: { id: 'abc' } });
  assert.deepEqual(ev.find(e => e[0] === 'history')[1], { symbol: 'R_100', prices: [841.3, 841.36], times: [1, 3], pipSize: 2 });
  ws.recv({ msg_type: 'tick', tick: { symbol: 'R_100', epoch: 5, quote: 841.4, pip_size: 2, id: 'abc' } });
  assert.deepEqual(ev.find(e => e[0] === 'tick')[1], { symbol: 'R_100', epoch: 5, quote: 841.4, pipSize: 2 });
  ws.recv({ msg_type: 'tick', echo_req: { ticks_history: '1HZ10V' }, error: { code: 'InvalidSymbol', message: 'Symbol 1HZ10V is invalid.' } });
  assert.deepEqual(ev.find(e => e[0] === 'symbol-error')[1], { symbol: '1HZ10V', code: 'InvalidSymbol', message: 'Symbol 1HZ10V is invalid.' });
  assert.equal(ev.filter(e => e[0] === 'status').pop()[1].state, 'online');
  ws.recv({ msg_type: 'time', time: 5_001, req_id: 1 });
  const lat = ev.filter(e => e[0] === 'latency').pop()[1]; assert.ok(Math.abs(lat.offsetSec - (5_001 - 5_000)) < 1e-9);
});

test('empty universe emits universe-empty; static list fallback subscribes 16 symbols', () => {
  const { f, ev, flush } = harness({ appId: '1089', token: '' });
  f.start(); const ws = FakeWS.last; ws.open();
  ws.recv({ msg_type: 'active_symbols', active_symbols: [], req_id: 3 });
  assert.ok(ev.some(e => e[0] === 'universe-empty'));
  f.useStaticList(); flush();
  assert.equal(ws.sent.filter(m => m.ticks_history).length, 16);
  assert.equal(STATIC_SYMBOLS.length, 16);
  assert.equal(ev.filter(e => e[0] === 'universe').pop()[1].length, 16);
});

test('token: authorize precedes discovery; authorize error surfaces', () => {
  const { f, ev } = harness({ appId: '1089', token: 'tok' });
  f.start(); const ws = FakeWS.last; assert.match(ws.url, /ws\.derivws\.com.*app_id=1089$/); ws.open();
  assert.ok(ws.sent.some(m => m.authorize === 'tok')); assert.ok(!ws.sent.some(m => m.active_symbols));
  assert.equal(ev.filter(e => e[0] === 'status').pop()[1].state, 'authorizing');
  ws.recv({ msg_type: 'authorize', authorize: { loginid: 'CR1' }, req_id: 2 });
  assert.ok(ws.sent.some(m => m.active_symbols));
  const { f: f2, ev: ev2 } = harness({ appId: '1089', token: 'bad' });
  f2.start(); FakeWS.last.open(); FakeWS.last.recv({ msg_type: 'authorize', error: { code: 'InvalidToken', message: 'The token is invalid.' }, req_id: 2 });
  assert.deepEqual(ev2.find(e => e[0] === 'error')[1], { code: 'InvalidToken', message: 'The token is invalid.' });
});

test('reconnect with back-off and forget_all + resubscribe', () => {
  const { f, timers, flush } = harness({ appId: '1089', token: '' });
  f.start(); let ws = FakeWS.last; ws.open();
  ws.recv({ msg_type: 'active_symbols', active_symbols: SYMS, req_id: 3 }); flush();
  ws.close();
  const reconnect = timers.find(t => t.ms === 1000); assert.ok(reconnect, 'first back-off is 1000 ms');
  timers.splice(timers.indexOf(reconnect), 1); reconnect.fn(); ws = FakeWS.last; ws.open();
  assert.equal(ws.sent[0].forget_all, 'ticks');
  assert.ok(!ws.sent.some(m => m.active_symbols), 'no rediscovery on reconnect');
  flush();
  assert.equal(ws.sent.filter(m => m.ticks_history).length, 3);
  ws.close(); // successful connection reset the back-off, so this is 1000 again
  const r2 = timers.filter(t => t.ms === 1000).pop(); assert.ok(r2, 'back-off restarts at 1000 after a good connection');
  timers.splice(timers.indexOf(r2), 1); r2.fn(); FakeWS.last.close(); // attempt fails without opening
  assert.ok(timers.some(t => t.ms === 2000), 'consecutive failure doubles the back-off');
  f.stop();
});

test('new public API field names are discovered; pat_ tokens do not force the legacy gateway', () => {
  const { f, ev } = harness({ appId: '1089', token: 'pat_abc' });
  f.start(); const ws = FakeWS.last; assert.equal(ws.url, 'wss://api.derivws.com/trading/v1/options/ws/public'); ws.open();
  assert.ok(!ws.sent.some(m => m.authorize), 'no authorize on the public socket');
  ws.recv({ msg_type: 'active_symbols', active_symbols: [
    { underlying_symbol: 'R_50', underlying_symbol_name: 'Volatility 50 Index', market: 'synthetic_index', pip_size: 0.0001 },
    { underlying_symbol: '1HZ15V', underlying_symbol_name: 'Volatility 15 (1s) Index', market: 'synthetic_index', pip_size: 0.001 },
    { underlying_symbol: 'frxEURUSD', underlying_symbol_name: 'EUR/USD', market: 'forex', pip_size: 0.00001 }
  ] });
  const uni = ev.find(e => e[0] === 'universe')[1];
  assert.deepEqual(uni.map(s => [s.symbol, s.pipSize]), [['1HZ15V', 3], ['R_50', 4]]);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const app = require('../js/main.js');

test('nextScanDelayMs prioritizes expiry, then the recurring interval', () => {
  const settings = { autoRescan: true, autoRescanSec: 30, rescanOnExpiry: true };

  assert.equal(app.nextScanDelayMs({ signal: { status: 'expired', _rescanPending: true }, lastScanAt: 0 }, settings, 100_000), 0);
  assert.equal(app.nextScanDelayMs({ signal: null, lastScanAt: 90_000 }, settings, 100_000), 20_000);
  assert.equal(app.nextScanDelayMs({ signal: null, lastScanAt: 60_000 }, settings, 100_000), 0);
  assert.equal(app.nextScanDelayMs({ signal: { status: 'live' }, lastScanAt: 0 }, settings, 100_000), null);
  assert.equal(app.nextScanDelayMs({ signal: null, lastScanAt: 0 }, Object.assign({}, settings, { autoRescan: false }), 100_000), null);
  // an expired signal no longer locks the scanner: the periodic interval applies again
  assert.equal(app.nextScanDelayMs({ signal: { status: 'expired' }, lastScanAt: 90_000 }, Object.assign({}, settings, { rescanOnExpiry: false }), 100_000), 20_000);
  assert.equal(app.nextScanDelayMs({ signal: { status: 'resolved', outcome: 'win' }, lastScanAt: 50_000 }, settings, 100_000), 0);
});

class FakeFeed {
  constructor(kind) {
    this.kind = kind;
    this.handlers = new Map();
    this.started = 0;
    this.stopped = 0;
    this.staticRequested = 0;
  }

  on(event, fn) {
    const set = this.handlers.get(event) || new Set();
    set.add(fn);
    this.handlers.set(event, set);
    return () => set.delete(fn);
  }

  emit(event, payload) {
    for (const fn of this.handlers.get(event) || []) fn(payload);
  }

  start() { this.started += 1; }
  stop() { this.stopped += 1; }
  useStaticList() { this.staticRequested += 1; }
}

function makeStore(settings) {
  let savedSettings = Object.assign({}, settings);
  let savedSignals = [];
  return {
    available: true,
    loadSettings: () => Object.assign({}, savedSettings),
    saveSettings: (patch) => { savedSettings = Object.assign({}, savedSettings, patch); return Object.assign({}, savedSettings); },
    loadSignals: () => savedSignals.slice(),
    saveSignals: (signals) => { savedSignals = signals.slice(); },
    clearSignals: () => { savedSignals = []; },
    get savedSignals() { return savedSignals; }
  };
}

function hotHistory(symbol) {
  const digits = Array.from({ length: 150 }, (_, i) => i % 10).concat(Array(50).fill(7));
  return {
    symbol,
    prices: digits.map(d => 800 + d / 100),
    times: digits.map((_, i) => 100 + i * 2),
    pipSize: 2
  };
}

test('createApp records an instant simulated signal and scores it from future ticks', () => {
  const feed = new FakeFeed('sim');
  const store = makeStore({ simulator: true, scanAnimMs: 0, autoRescan: false, rescanOnExpiry: false, appId: '1089', token: '', window: 200, recent: 50, mode: 'standard', kappa: 200, minSample: 180, minZFull: 1.5, minZRecent: 1, recencyGate: true, maxSinceLast: 10, maxLagSec: 1.5, cooldownSec: 20, entryWindowTicks: 5, horizonTicks: 1, payoutMultiple: 8.9, accuracySource: 'all' });
  let now = 500_000;
  const instance = app.createApp({
    store,
    makeFeed: () => feed,
    now: () => now,
    setInterval: () => 1,
    clearInterval: () => {},
    setTimeout: () => 2,
    clearTimeout: () => {}
  });

  instance.start();
  assert.equal(feed.started, 1);
  feed.emit('status', { state: 'online', kind: 'sim' });
  feed.emit('universe', [{ symbol: 'R_100', name: 'Volatility 100 Index', pipSize: 2 }]);
  feed.emit('history', hotHistory('R_100'));
  assert.equal(instance.state.active, 'R_100');
  assert.equal(instance.state.activeStats.n, 200);

  instance.actions.scan();
  assert.equal(instance.state.scan.phase, 'done');
  assert.equal(instance.state.signal.digit, 7);
  assert.equal(instance.state.signals.length, 1);
  assert.equal(store.savedSignals.length, 1);

  now = 501_000;
  feed.emit('tick', { symbol: 'R_100', epoch: 500, quote: 800.01, pipSize: 2 });
  now = 503_000;
  feed.emit('tick', { symbol: 'R_100', epoch: 502, quote: 800.07, pipSize: 2 });
  assert.equal(instance.state.signal.outcome, 'win');
  assert.equal(instance.state.metrics.wins, 1);
  instance.stop();
});

test('changing simulator setting stops the old feed and starts a new feed', () => {
  const feeds = [];
  const settings = { simulator: true, scanAnimMs: 0, autoRescan: false, rescanOnExpiry: false, appId: '1089', token: '', window: 200, recent: 50, mode: 'standard', kappa: 200, minSample: 180, minZFull: 1.5, minZRecent: 1, recencyGate: true, maxSinceLast: 10, maxLagSec: 1.5, cooldownSec: 20, entryWindowTicks: 5, horizonTicks: 1, payoutMultiple: 8.9, accuracySource: 'all' };
  const instance = app.createApp({
    store: makeStore(settings),
    makeFeed: next => { const feed = new FakeFeed(next.simulator ? 'sim' : 'live'); feeds.push(feed); return feed; },
    now: () => 1_000,
    setInterval: () => 1,
    clearInterval: () => {},
    setTimeout: () => 2,
    clearTimeout: () => {}
  });

  instance.start();
  instance.actions.setSettings({ simulator: false });
  assert.equal(feeds.length, 2);
  assert.equal(feeds[0].stopped, 1);
  assert.equal(feeds[1].started, 1);
  assert.equal(instance.state.feedStatus.kind, 'live');
  instance.stop();
});

test('start arms the recurring scan interval from the startup time', () => {
  const settings = { simulator: true, scanAnimMs: 0, autoRescan: true, autoRescanSec: 30, rescanOnExpiry: true, appId: '1089', token: '', window: 200, recent: 50, mode: 'standard', kappa: 200, minSample: 180, minZFull: 1.5, minZRecent: 1, recencyGate: true, maxSinceLast: 10, maxLagSec: 1.5, cooldownSec: 20, entryWindowTicks: 5, horizonTicks: 1, payoutMultiple: 8.9, accuracySource: 'all' };
  const instance = app.createApp({
    store: makeStore(settings), makeFeed: () => new FakeFeed('sim'), now: () => 100_000,
    setInterval: () => 1, clearInterval: () => {}, setTimeout: () => 2, clearTimeout: () => {}
  });

  instance.start();
  assert.equal(instance.state.lastScanAt, 100_000);
  assert.equal(app.nextScanDelayMs(instance.state, instance.state.settings, 100_000), 30_000);
  instance.stop();
});

test('scheduler tick expires a live signal and rescans immediately when rescanOnExpiry is on', () => {
  const feed = new FakeFeed('sim');
  const store = makeStore({ simulator: true, scanAnimMs: 0, autoRescan: true, autoRescanSec: 30, rescanOnExpiry: true, appId: '1089', token: '', window: 200, recent: 50, mode: 'standard', kappa: 200, minSample: 180, minZFull: 1.5, minZRecent: 1, recencyGate: true, maxSinceLast: 10, maxLagSec: 1.5, cooldownSec: 20, entryWindowTicks: 5, horizonTicks: 1, payoutMultiple: 8.9, accuracySource: 'all' });
  let now = 500_000; const intervals = [];
  const instance = app.createApp({ store, makeFeed: () => feed, now: () => now, setInterval: (fn, ms) => { intervals.push({ fn, ms }); return intervals.length; }, clearInterval: () => {}, setTimeout: () => 2, clearTimeout: () => {} });
  instance.start();
  feed.emit('status', { state: 'online', kind: 'sim' });
  feed.emit('universe', [{ symbol: 'R_100', name: 'Volatility 100 Index', pipSize: 2 }]);
  feed.emit('history', hotHistory('R_100'));
  instance.actions.scan();
  const first = instance.state.signal; assert.equal(first.status, 'live'); assert.equal(first.validFor, 10);
  const tick = intervals.find(i => i.ms === 1000).fn;
  now = 505_000; tick(); assert.equal(first.status, 'live');
  // keep the market fresh so it is not stale at expiry; cooldown (20 s) blocks a re-fire on the same market
  feed.emit('tick', { symbol: 'R_100', epoch: 505, quote: 800.03, pipSize: 2 });
  now = 510_500; tick();
  assert.equal(first.status, 'expired');
  assert.equal(instance.state.lastScanAt, 510_500, 'a rescan ran at expiry');
  assert.equal(instance.state.scan.phase, 'done');
  assert.equal(instance.state.signal, null, 'cooldown blocks the same market, so no new signal');
  instance.stop();
});

test('animated scan computes the signal when the animation finishes, so validity starts on display', () => {
  const feed = new FakeFeed('sim');
  const store = makeStore({ simulator: true, scanAnimMs: 3500, autoRescan: false, rescanOnExpiry: false, appId: '1089', token: '', window: 200, recent: 50, mode: 'standard', kappa: 200, minSample: 180, minZFull: 1.5, minZRecent: 1, recencyGate: true, maxSinceLast: 10, maxLagSec: 1.5, cooldownSec: 20, entryWindowTicks: 5, horizonTicks: 1, payoutMultiple: 8.9, accuracySource: 'all' });
  let now = 700_000; const intervals = [];
  const instance = app.createApp({ store, makeFeed: () => feed, now: () => now, setInterval: (fn, ms) => { intervals.push({ fn, ms }); return intervals.length; }, clearInterval: () => {}, setTimeout: () => 2, clearTimeout: () => {} });
  instance.start();
  feed.emit('status', { state: 'online', kind: 'sim' });
  feed.emit('universe', [{ symbol: 'R_100', name: 'Volatility 100 Index', pipSize: 2 }]);
  feed.emit('history', hotHistory('R_100'));
  instance.actions.scan();
  assert.equal(instance.state.scan.phase, 'running'); assert.equal(instance.state.signal, null);
  const progress = intervals[intervals.length - 1].fn;
  now = 702_000; progress(); assert.equal(instance.state.scan.phase, 'running');
  now = 703_600; feed.emit('tick', { symbol: 'R_100', epoch: 703, quote: 800.07, pipSize: 2 }); progress();
  assert.equal(instance.state.scan.phase, 'done');
  const sig = instance.state.signal;
  assert.equal(sig.issuedAt, 703_600, 'issued when the animation finished');
  assert.equal(sig.issueEpoch, 703, 'anchored to the newest tick at finish time');
  assert.deepEqual(Object.keys(sig.gates), ['sample', 'zFull', 'zRecent', 'recency', 'feed', 'cooldown']);
  assert.ok(Object.values(sig.gates).every(g => g.pass));
  instance.stop();
});

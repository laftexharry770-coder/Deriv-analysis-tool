// matches-sniper/js/sim.js
(function (root, factory) {
  const mod = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  root.MS = root.MS || {}; root.MS.sim = mod;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  const util = (typeof require === 'function' && typeof module !== 'undefined') ? require('./util.js') : root.MS.util;

  // Real Deriv cadence (1 s for 1HZ*, 2 s otherwise) and quote precision per symbol.
  const SIM_SYMBOLS = [
    { symbol: 'R_10', name: 'Volatility 10 Index', pipSize: 3, interval: 2, base: 6321.5, vol: 0.6 },
    { symbol: 'R_25', name: 'Volatility 25 Index', pipSize: 3, interval: 2, base: 2612.4, vol: 0.9 },
    { symbol: 'R_50', name: 'Volatility 50 Index', pipSize: 4, interval: 2, base: 181.2, vol: 0.15 },
    { symbol: 'R_75', name: 'Volatility 75 Index', pipSize: 4, interval: 2, base: 98412.3, vol: 60 },
    { symbol: 'R_100', name: 'Volatility 100 Index', pipSize: 2, interval: 2, base: 841.36, vol: 1.2 },
    { symbol: '1HZ10V', name: 'Volatility 10 (1s) Index', pipSize: 2, interval: 1, base: 9660.78, vol: 0.9 },
    { symbol: '1HZ15V', name: 'Volatility 15 (1s) Index', pipSize: 2, interval: 1, base: 1012.4, vol: 0.3 },
    { symbol: '1HZ25V', name: 'Volatility 25 (1s) Index', pipSize: 2, interval: 1, base: 2231.7, vol: 0.8 },
    { symbol: '1HZ30V', name: 'Volatility 30 (1s) Index', pipSize: 2, interval: 1, base: 997.1, vol: 0.5 },
    { symbol: '1HZ50V', name: 'Volatility 50 (1s) Index', pipSize: 2, interval: 1, base: 312.6, vol: 0.4 },
    { symbol: '1HZ75V', name: 'Volatility 75 (1s) Index', pipSize: 2, interval: 1, base: 6320.9, vol: 6 },
    { symbol: '1HZ90V', name: 'Volatility 90 (1s) Index', pipSize: 2, interval: 1, base: 1004.8, vol: 1.4 },
    { symbol: '1HZ100V', name: 'Volatility 100 (1s) Index', pipSize: 2, interval: 1, base: 833.62, vol: 1.3 },
    { symbol: '1HZ150V', name: 'Volatility 150 (1s) Index', pipSize: 2, interval: 1, base: 1021.3, vol: 2.4 },
    { symbol: '1HZ250V', name: 'Volatility 250 (1s) Index', pipSize: 2, interval: 1, base: 1009.9, vol: 4 },
    { symbol: '1HZ300V', name: 'Volatility 300 (1s) Index', pipSize: 2, interval: 1, base: 1002.2, vol: 5 }
  ];

  function gauss() { let u = 0, v = 0; while (u === 0) u = Math.random(); while (v === 0) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

  class SimFeed extends util.EventBus {
    constructor(opts) {
      super(); opts = opts || {};
      this.kind = 'sim';
      this._now = opts.now || (() => Date.now());
      this._setTimeout = opts.setTimeout || ((fn, ms) => setTimeout(fn, ms));
      this._clearTimeout = opts.clearTimeout || ((id) => clearTimeout(id));
      this._price = new Map(); this._timers = new Map(); this._running = false;
    }
    _spec(symbol) { return SIM_SYMBOLS.find(s => s.symbol === symbol); }
    // Random-walk the price, then overwrite the last digit with a crypto-uniform one (as Deriv's RNG does).
    nextTick(symbol, epoch) {
      const s = this._spec(symbol); const scale = Math.pow(10, s.pipSize);
      let p = this._price.get(symbol); if (p == null) p = s.base;
      p = Math.max(s.base * 0.5, p + gauss() * s.vol);
      const units = Math.floor(p * scale / 10) * 10 + util.randomDigit();
      const quote = Number((units / scale).toFixed(s.pipSize));
      this._price.set(symbol, quote);
      return { symbol, epoch, quote, pipSize: s.pipSize };
    }
    start() {
      this._running = true;
      this.emit('status', { state: 'online', kind: 'sim' });
      this.emit('universe', SIM_SYMBOLS.map(s => ({ symbol: s.symbol, name: s.name, pipSize: s.pipSize })));
      const nowSec = Math.floor(this._now() / 1000);
      for (const s of SIM_SYMBOLS) {
        const prices = [], times = [];
        for (let i = 249; i >= 0; i--) { const t = this.nextTick(s.symbol, nowSec - i * s.interval); prices.push(t.quote); times.push(t.epoch); }
        this.emit('history', { symbol: s.symbol, prices, times, pipSize: s.pipSize });
        this._schedule(s, nowSec + s.interval);
      }
    }
    _schedule(s, nextEpoch) {
      const delay = Math.max(0, nextEpoch * 1000 - this._now());
      const id = this._setTimeout(() => {
        if (!this._running) return;
        this.emit('tick', this.nextTick(s.symbol, nextEpoch));
        this._schedule(s, nextEpoch + s.interval);
      }, delay);
      this._timers.set(s.symbol, id);
    }
    stop() { this._running = false; for (const id of this._timers.values()) this._clearTimeout(id); this._timers.clear(); this.emit('status', { state: 'offline', kind: 'sim' }); }
  }
  return { SimFeed, SIM_SYMBOLS };
});

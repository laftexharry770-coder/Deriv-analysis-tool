// matches-sniper/js/markets.js
(function (root, factory) {
  const mod = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  root.MS = root.MS || {}; root.MS.markets = mod;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  const util = (typeof require === 'function' && typeof module !== 'undefined') ? require('./util.js') : root.MS.util;

  class MarketBook {
    constructor(opts) { opts = opts || {}; this.cap = opts.cap || 1000; this.staleFactor = opts.staleFactor || 5; this._m = new Map(); this._order = []; }
    setUniverse(list) {
      const next = new Map();
      for (const s of list) {
        const prev = this._m.get(s.symbol);
        if (prev) { if (s.name) prev.name = s.name; if (s.pipSize != null) prev.pipSize = s.pipSize; next.set(s.symbol, prev); }
        else next.set(s.symbol, { symbol: s.symbol, name: s.name || s.symbol, pipSize: s.pipSize == null ? null : s.pipSize, ticks: [], available: true, unavailableReason: null, stale: false, lagEma: null, lagMax: 0, lastTickMs: null, lastSignalAt: 0, subscriptionId: null });
      }
      this._m = next; this._order = list.map(s => s.symbol);
    }
    get(symbol) { return this._m.get(symbol) || null; }
    all() { return this._order.map(s => this._m.get(s)); }
    _push(m, tick) { m.ticks.push(tick); if (m.ticks.length > this.cap) m.ticks.splice(0, m.ticks.length - this.cap); }
    addHistory(symbol, prices, times, pipSize) {
      const m = this.get(symbol); if (!m) return;
      if (pipSize != null) m.pipSize = pipSize;
      const pip = m.pipSize == null ? 2 : m.pipSize;
      m.ticks = [];
      for (let i = 0; i < prices.length; i++) this._push(m, { symbol, epoch: Number(times[i]), quote: Number(prices[i]), digit: util.lastDigit(prices[i], pip) });
      m.available = true; m.unavailableReason = null;
    }
    addTick(t, nowMs) {
      const m = this.get(t.symbol); if (!m) return null;
      if (t.pipSize != null) m.pipSize = t.pipSize;
      const pip = m.pipSize == null ? 2 : m.pipSize;
      const tick = { symbol: t.symbol, epoch: Number(t.epoch), quote: Number(t.quote), digit: util.lastDigit(t.quote, pip) };
      if (m.ticks.length && tick.epoch <= m.ticks[m.ticks.length - 1].epoch) return null; // duplicate / out of order
      this._push(m, tick);
      const lag = Math.max(0, nowMs / 1000 - tick.epoch);
      m.lagEma = m.lagEma == null ? lag : m.lagEma * 0.7 + lag * 0.3;
      m.lagMax = Math.max(m.lagMax, lag);
      m.lastTickMs = nowMs; m.stale = false;
      return tick;
    }
    markUnavailable(symbol, reason) { const m = this.get(symbol); if (m) { m.available = false; m.unavailableReason = reason || 'unavailable'; } }
    isStale(symbol, nowMs) {
      const m = this.get(symbol); if (!m) return true;
      // before the first live tick, judge freshness by the newest history epoch
      const last = m.lastTickMs != null ? m.lastTickMs : (m.ticks.length ? m.ticks[m.ticks.length - 1].epoch * 1000 : null);
      if (last == null) return true;
      return nowMs - last > this.staleFactor * util.defaultInterval(symbol) * 1000;
    }
    refreshStale(nowMs) { for (const m of this.all()) m.stale = this.isStale(m.symbol, nowMs); }
  }
  return { MarketBook };
});

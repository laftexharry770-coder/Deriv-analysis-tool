// matches-sniper/js/feed.js — Deriv WebSocket API v3 client (market data only; no trading calls)
(function (root, factory) {
  const mod = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  root.MS = root.MS || {}; root.MS.feed = mod;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  const util = (typeof require === 'function' && typeof module !== 'undefined') ? require('./util.js') : root.MS.util;
  const STATIC_SYMBOLS = [
    ['R_10', 'Volatility 10 Index'], ['R_25', 'Volatility 25 Index'], ['R_50', 'Volatility 50 Index'], ['R_75', 'Volatility 75 Index'], ['R_100', 'Volatility 100 Index'],
    ['1HZ10V', 'Volatility 10 (1s) Index'], ['1HZ15V', 'Volatility 15 (1s) Index'], ['1HZ25V', 'Volatility 25 (1s) Index'], ['1HZ30V', 'Volatility 30 (1s) Index'],
    ['1HZ50V', 'Volatility 50 (1s) Index'], ['1HZ75V', 'Volatility 75 (1s) Index'], ['1HZ90V', 'Volatility 90 (1s) Index'], ['1HZ100V', 'Volatility 100 (1s) Index'],
    ['1HZ150V', 'Volatility 150 (1s) Index'], ['1HZ250V', 'Volatility 250 (1s) Index'], ['1HZ300V', 'Volatility 300 (1s) Index']
  ].map(([symbol, name]) => ({ symbol, name, pipSize: null }));
  const VOL_RE = /^Volatility (\d+)( \(1s\))? Index$/;
  // Deriv's new public market-data socket needs no app id or token (verified 2026-09-16); the legacy v3
  // gateway is used only when a legacy (non-pat_) API token is configured.
  const PUBLIC_ENDPOINT = 'wss://api.derivws.com/trading/v1/options/ws/public';
  const ENDPOINT = 'wss://ws.derivws.com/websockets/v3?app_id=';
  const legacyToken = (t) => { const v = String(t || '').trim(); return v && !/^pat_/i.test(v) ? v : ''; };
  const pipDigits = (pip) => { if (pip == null) return null; const s = String(pip); const i = s.indexOf('.'); return i < 0 ? 0 : s.length - i - 1; };

  class DerivFeed extends util.EventBus {
    constructor(settings, opts) {
      super(); opts = opts || {};
      this.kind = 'live'; this.settings = settings || {};
      this._WS = opts.WebSocket || root.WebSocket;
      this._now = opts.now || (() => Date.now());
      this._setTimeout = opts.setTimeout || ((fn, ms) => setTimeout(fn, ms));
      this._clearTimeout = opts.clearTimeout || ((id) => clearTimeout(id));
      this._ws = null; this._universe = []; this._attempt = 0; this._stopped = true; this._timers = []; this._pingSentAt = 0; this._reqId = 100; this._online = false;
    }
    _send(obj) { if (this._ws && this._ws.readyState === 1) this._ws.send(JSON.stringify(obj)); }
    _later(fn, ms) { const id = this._setTimeout(fn, ms); this._timers.push(id); return id; }
    _setOnline() { if (!this._online) { this._online = true; this.emit('status', { state: 'online', kind: 'live' }); } }
    start() { this._stopped = false; this._attempt = 0; this._connect(); }
    _connect() {
      const old = this._ws; this._ws = null;
      if (old && old.readyState < 2) { try { old.close(); } catch (e) { /* ignore */ } } // never leave a live socket dangling
      this._online = false;
      this.emit('status', { state: 'connecting', kind: 'live' });
      const token = legacyToken(this.settings.token);
      this._legacy = !!token;
      const ws = new this._WS(token ? ENDPOINT + encodeURIComponent(this.settings.appId || '1089') : PUBLIC_ENDPOINT); this._ws = ws;
      const reconnecting = this._attempt > 0;
      ws.onopen = () => {
        this._attempt = 0;
        if (reconnecting) this._send({ forget_all: 'ticks' });
        this._send({ time: 1, req_id: 1 });
        if (token) { this.emit('status', { state: 'authorizing', kind: 'live' }); this._send({ authorize: token, req_id: 2 }); }
        else { this._setOnline(); if (reconnecting && this._universe.length) this._subscribeAll(); else this._discover(); }
        this._later(() => this._ping(), 30000);
      };
      ws.onmessage = (ev) => { let m; try { m = JSON.parse(ev.data); } catch (e) { return; } this._handle(m); };
      ws.onerror = () => { /* onclose follows */ };
      ws.onclose = () => {
        if (this._ws !== ws) return; // stale socket from a previous connection
        this._online = false;
        this.emit('status', { state: 'offline', kind: 'live' });
        if (this._stopped) return;
        const delay = Math.min(30000, 1000 * Math.pow(2, this._attempt)); this._attempt++;
        this._later(() => this._connect(), delay);
      };
    }
    _ping() { if (this._stopped || !this._ws || this._ws.readyState !== 1) return; this._pingSentAt = this._now(); this._send({ ping: 1 }); this._later(() => this._ping(), 30000); }
    _discover() { this._send({ active_symbols: 'brief', req_id: 3 }); }
    _subscribeAll() {
      this._universe.forEach((s, i) => this._later(() => this._send({ ticks_history: s.symbol, count: 300, end: 'latest', style: 'ticks', subscribe: 1, req_id: this._reqId++ }), 60 * i));
    }
    useStaticList() { this._universe = STATIC_SYMBOLS.map(s => Object.assign({}, s)); this.emit('universe', this._universe.slice()); this._subscribeAll(); }
    _handle(m) {
      if (m.error) {
        if (m.error.code === 'InvalidSymbol' && m.echo_req && m.echo_req.ticks_history) { this.emit('symbol-error', { symbol: m.echo_req.ticks_history, code: m.error.code, message: m.error.message }); return; }
        this.emit('error', { code: m.error.code, message: m.error.message }); return;
      }
      switch (m.msg_type) {
        case 'time': this.emit('latency', { rttMs: null, offsetSec: Number(m.time) - this._now() / 1000 }); break;
        case 'ping': this.emit('latency', { rttMs: this._now() - this._pingSentAt, offsetSec: null }); break;
        case 'authorize': this._setOnline(); if (this._universe.length) this._subscribeAll(); else this._discover(); break;
        case 'active_symbols': {
          // new public API: underlying_symbol / underlying_symbol_name / pip_size; legacy: symbol / display_name / pip
          const list = (m.active_symbols || []).map(s => ({ symbol: s.underlying_symbol || s.symbol, name: s.underlying_symbol_name || s.display_name || '', market: s.market, pip: s.pip_size != null ? s.pip_size : s.pip }))
            .filter(s => s.market === 'synthetic_index' && VOL_RE.test(s.name))
            .map(s => { const mm = VOL_RE.exec(s.name); return { symbol: s.symbol, name: s.name, pipSize: pipDigits(s.pip), _n: Number(mm[1]), _s: mm[2] ? 1 : 0 }; })
            .sort((a, b) => a._n - b._n || a._s - b._s).map(({ symbol, name, pipSize }) => ({ symbol, name, pipSize }));
          if (!list.length) { this.emit('universe-empty'); break; }
          this._universe = list; this._setOnline(); this.emit('universe', list.slice()); this._subscribeAll(); break;
        }
        case 'history': if (m.history) { this._setOnline(); this.emit('history', { symbol: m.echo_req.ticks_history, prices: m.history.prices.map(Number), times: m.history.times.map(Number), pipSize: m.pip_size }); } break;
        case 'tick': if (m.tick) { this._setOnline(); this.emit('tick', { symbol: m.tick.symbol, epoch: Number(m.tick.epoch), quote: Number(m.tick.quote), pipSize: m.tick.pip_size }); } break;
        default: break;
      }
    }
    stop() { this._stopped = true; for (const id of this._timers) this._clearTimeout(id); this._timers = []; const ws = this._ws; this._ws = null; if (ws) { try { ws.close(); } catch (e) { /* ignore */ } } this._online = false; }
  }
  return { DerivFeed, STATIC_SYMBOLS, VOL_RE, pipDigits, ENDPOINT, PUBLIC_ENDPOINT };
});

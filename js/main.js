// matches-sniper/js/main.js — app wiring: session gate, entitlements, scanner scheduler, signal countdown, rendering
(function (root, factory) {
  const mod = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  root.MS = root.MS || {}; root.MS.app = mod;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  const isNode = typeof require === 'function' && typeof module !== 'undefined';
  const modules = isNode ? {
    MarketBook: require('./markets.js').MarketBook, stats: require('./stats.js'), signals: require('./signals.js'), tracker: require('./tracker.js'),
    store: require('./store.js'), SimFeed: require('./sim.js').SimFeed, DerivFeed: require('./feed.js').DerivFeed, access: require('./access.js')
  } : {
    MarketBook: root.MS.markets.MarketBook, stats: root.MS.stats, signals: root.MS.signals, tracker: root.MS.tracker,
    store: root.MS.store, SimFeed: root.MS.sim.SimFeed, DerivFeed: root.MS.feed.DerivFeed, access: root.MS.access
  };
  const CFG = (root.MS && root.MS.config) || { freePages: ['dashboard', 'frequency', 'account', 'upgrade', 'settings'], priceUsd: 70, premiumDays: 30, contact: {} };

  const PHASE_LABELS = ['Scanning volatility markets', 'Collecting recent tick data', 'Extracting last digits', 'Comparing digit distributions', 'Checking sniper gates', 'Selecting the best market'];
  const ALL_PAGES = ['dashboard', 'scanner', 'matches', 'signal', 'frequency', 'accuracy', 'settings', 'account', 'upgrade', 'support', 'admin'];
  const PREDICT_STEPS = ['Pulling Deriv tick history', 'Counting appearances per digit', 'Ranking digits by frequency', 'Comparing against the 10% baseline', 'Estimating win probability'];
  const DATA_PAGES = ['dashboard', 'frequency', 'matches'];
  const FORM_PAGES = ['settings', 'account', 'upgrade', 'admin', 'support'];

  // Scans are user-initiated only (as in the reference tools): the scheduler never starts one.
  function nextScanDelayMs() { return null; }

  function createApp(deps) {
    deps = deps || {};
    const doc = deps.document === undefined ? root.document : deps.document;
    const store = deps.store || modules.store.createStore();
    const now = deps.now || (() => Date.now());
    const setIntervalFn = deps.setInterval || root.setInterval.bind(root);
    const clearIntervalFn = deps.clearInterval || root.clearInterval.bind(root);
    const setTimeoutFn = deps.setTimeout || root.setTimeout.bind(root);
    const makeFeed = deps.makeFeed || ((settings) => settings.simulator ? new modules.SimFeed() : new modules.DerivFeed(settings));
    // auth layer: explicit `null` (tests) means "no accounts, everything open"; in the browser it must exist
    const auth = deps.auth !== undefined ? deps.auth : ((root.MS && root.MS.auth) || null);
    const A = modules.access;

    const state = {
      settings: Object.assign({}, modules.signals.DEFAULT_SETTINGS), page: 'dashboard',
      feedStatus: { state: 'offline', kind: 'live' }, latency: { rttMs: null, offsetSec: null },
      book: new modules.MarketBook(), active: null, activeStats: null, overview: [], freq: { mode: 'full' },
      scan: { phase: 'idle', progress: 0, remainingMs: 0, phases: idlePhases(), result: null },
      signal: null, countdown: { remainingSec: 0, totalSec: 0 }, signals: [],
      metrics: modules.tracker.metrics([], { payoutMultiple: modules.signals.DEFAULT_SETTINGS.payoutMultiple, source: 'all' }),
      accuracySource: 'all', storeAvailable: !!store.available, lastScanAt: 0,
      authless: !auth, session: null, profile: deps.profile || null, account: null,
      predict: { phase: 'idle', kind: null, progress: 0, steps: [], result: null, marketName: '' }
    };

    let feed = null, feedUnsubs = [], tickTimer = null, countdownTimer = null, scanTimer = null, predictTimer = null, started = false, uiMounted = false, lastActiveRenderAt = 0, feedRunning = false;

    function idlePhases() { return PHASE_LABELS.map(label => ({ label, state: 'waiting' })); }
    function activeMarket() { return state.active ? state.book.get(state.active) : null; }
    function computeStatsFor(market) { return market ? modules.stats.computeStats(market.ticks, Object.assign({}, state.settings, { symbol: market.symbol })) : null; }
    function refreshDerived() { state.overview = state.book.all().map(m => Object.assign({}, m, { stats: computeStatsFor(m) })); state.activeStats = computeStatsFor(activeMarket()); }
    function refreshMetrics() { state.metrics = modules.tracker.metrics(state.signals, { payoutMultiple: state.settings.payoutMultiple, source: state.accuracySource }); }
    function persistSignals() { store.saveSignals(state.signals); state.storeAvailable = !!store.available; }
    function persistSettings() { state.settings = store.saveSettings(state.settings); state.storeAvailable = !!store.available; }
    function shell() { return !isNode && root.MS && root.MS.ui && root.MS.ui.shell; }
    function premiumActive() { return state.authless || A.hasFullAccess(state.profile, CFG, now()); }
    function landingUi() { return !isNode && root.MS.ui && root.MS.ui.landing; }
    function showLanding() { const l = landingUi(); if (l) l.show(state); const m = doc && doc.querySelector('.main'); if (m) m.hidden = true; }
    function hideLanding() { const l = landingUi(); if (l) l.hide(); const m = doc && doc.querySelector('.main'); if (m) m.hidden = false; }
    function pageGate(page) { return state.authless ? 'ok' : A.pageAccess(page, state.profile, CFG, now()); }

    function updatePills() {
      const ui = shell(); if (!ui) return;
      const active = activeMarket();
      const status = (state.feedStatus && state.feedStatus.state) || 'offline';
      const system = status === 'online' ? 'ONLINE' : status.toUpperCase();
      let feedText;
      if (state.feedStatus && state.feedStatus.kind === 'sim') feedText = 'SIMULATED';
      else if (status !== 'online') feedText = status.toUpperCase();
      else if (active && active.stale) feedText = 'STALE';
      else if (active && active.ticks.length) feedText = 'LIVE';
      else feedText = 'WAITING';
      ui.setPills({ system, feed: feedText });
      renderChip();
    }

    function renderChip() {
      if (!doc) return;
      const chip = doc.getElementById('account-chip'); if (!chip) return;
      const b = A.accountBadge(state.profile, now());
      if (!b) { chip.hidden = true; const n = doc.getElementById('nav-admin'); if (n) n.hidden = true; return; }
      const C = root.MS.ui.components;
      chip.innerHTML = '<span>' + C.esc(b.id) + '</span>' + (b.tick ? '<span class="tick" title="Verified premium user">✓</span>' : '') + '<span class="tier ' + (b.tier === 'PREMIUM' ? 'premium' : 'free') + '">' + b.tier + '</span>';
      chip.hidden = false;
      const nav = doc.getElementById('nav-admin'); if (nav) nav.hidden = !A.isAdmin(state.profile, CFG);
    }

    function lockHtml(page) {
      const C = root.MS.ui.components;
      const names = { scanner: 'Volatility Scanner', matches: 'Matches / Differs', signal: 'Matches Signal', accuracy: 'Accuracy', dashboard: 'Dashboard', frequency: 'Frequency Graph' };
      return '<h2>' + C.esc(names[page] || page) + '</h2><div class="card lock"><div class="lock-ic">★</div><h3>Premium required</h3><p>' + C.esc(names[page] || 'This page') + ' is part of the $' + CFG.priceUsd + '/month subscription. Free accounts can use the Dashboard and Frequency Graph.</p><div class="controls" style="justify-content:center"><button type="button" class="btn primary" data-act="upgrade">Upgrade — $' + CFG.priceUsd + '/month</button><button type="button" class="btn ghost" data-act="account">My account</button></div></div>';
    }

    // Pages are rebuilt with innerHTML, so unforced (timer / tick) renders must not clobber a form the
    // user is editing: form pages only render when forced, and any page is left alone while one of its inputs has focus.
    function renderPage(page, force) {
      if (!doc || !uiMounted) return;
      page = page || state.page;
      if (page !== state.page) return;
      if (!force && FORM_PAGES.includes(page)) return;
      const el = doc.getElementById('page-' + page);
      const focused = doc.activeElement;
      if (!force && el && focused && el.contains(focused) && /^(INPUT|SELECT|TEXTAREA)$/.test(focused.tagName)) return;
      const gate = pageGate(page);
      if (gate === 'premium' && el) {
        el.innerHTML = lockHtml(page);
        el.querySelector('[data-act="upgrade"]').addEventListener('click', () => actions.navigate('upgrade'));
        el.querySelector('[data-act="account"]').addEventListener('click', () => actions.navigate('account'));
        return;
      }
      const ui = root.MS.ui && root.MS.ui[page];
      if (ui && ui.render) ui.render(state);
    }
    function renderAll() { refreshDerived(); updatePills(); renderPage(state.page); }
    // Live (per-tick) updates patch only the parts of the page that change. They are skipped while the tab is hidden
    // and deferred while the user is scrolling, so a phone never stutters because a tick arrived mid-swipe.
    let liveDeferred = false;
    function renderData(derivedFresh) {
      if (!derivedFresh) refreshDerived();
      updatePills();
      if (!DATA_PAGES.includes(state.page)) return;
      if (doc && doc.hidden) return;
      if (scrolling()) { if (!liveDeferred) { liveDeferred = true; setTimeoutFn(() => { liveDeferred = false; renderData(true); }, 220); } return; }
      if (pageGate(state.page) !== 'ok') { renderPage(state.page); return; } // the lock screen, never live content
      const el = doc && doc.getElementById('page-' + state.page);
      const focused = doc && doc.activeElement;
      if (el && focused && el.contains(focused) && /^(INPUT|SELECT|TEXTAREA)$/.test(focused.tagName)) return; // same guard as renderPage
      const ui = root.MS.ui && root.MS.ui[state.page];
      if (ui && ui.renderLive && el && el.children.length) ui.renderLive(state); else renderPage(state.page);
    }
    let lastScrollAt = 0;
    function scrolling() { return now() - lastScrollAt < 180; }
    function renderCountdownOnly() { if (!doc || state.page !== 'signal') return; const ui = root.MS.ui && root.MS.ui.signal; if (ui && ui.renderCountdown) ui.renderCountdown(state); }

    function showBanner(banner) {
      const ui = shell(); if (!ui) return;
      ui.showBanner(banner, (id) => { if (id === 'settings') actions.navigate('settings'); if (id === 'static') actions.useStatic(); if (id === 'sim') actions.useSim(true); });
    }
    function hideBanner() { const ui = shell(); if (ui) ui.hideBanner(); }
    function toast(message, kind) { const ui = shell(); if (ui) ui.toast(message, kind); }

    function mountUi() {
      if (doc && doc.addEventListener && !mountUi._scroll) { mountUi._scroll = true; doc.addEventListener('scroll', () => { lastScrollAt = now(); }, { passive: true, capture: true }); doc.addEventListener('touchmove', () => { lastScrollAt = now(); }, { passive: true }); }
      if (!doc || uiMounted || !root.MS || !root.MS.ui || !root.MS.ui.shell) return;
      const ui = root.MS.ui;
      ui.shell.mount(doc, { onNavigate: actions.navigate });
      ALL_PAGES.forEach((page) => { const r = ui[page]; const el = doc.getElementById('page-' + page); if (r && r.mount && el) r.mount(el, actions); });
      const chip = doc.getElementById('account-chip'); if (chip) chip.addEventListener('click', () => actions.navigate('account'));
      const land = doc.getElementById('landing'); if (land && ui.landing) ui.landing.mount(land, actions);
      uiMounted = true;
      ui.shell.setPage(state.page);
    }

    function updateActiveIfNeeded(symbol) {
      if (!state.active) state.active = symbol;
      if (symbol !== state.active) return false;
      lastActiveRenderAt = now(); refreshDerived(); return true;
    }

    function resolveOpenSignals(symbol) {
      const market = state.book.get(symbol); if (!market) return false;
      let changed = false;
      for (const s of state.signals) if (s.symbol === symbol && s.outcome == null && modules.tracker.resolveSignal(s, market.ticks)) changed = true;
      if (changed) { refreshMetrics(); persistSignals(); }
      return changed;
    }

    function handleFeedEvent(event, payload) {
      if (event === 'status') { state.feedStatus = payload || { state: 'offline', kind: feed ? feed.kind : 'live' }; updatePills(); renderPage(state.page); return; }
      if (event === 'universe') {
        state.book.setUniverse(payload || []);
        const preferred = state.settings.activeSymbol;
        state.active = state.book.get(preferred) ? preferred : (state.book.all()[0] || {}).symbol || null;
        hideBanner(); refreshDerived(); renderAll(); return;
      }
      if (event === 'universe-empty') {
        showBanner({ title: 'Deriv returned no tradable symbols for this connection', body: 'The market list came back empty. Try the static symbol list, run the simulator, or (legacy tokens only) add a Deriv API token in Settings.',
          actions: [{ label: 'Add API token', id: 'settings', primary: true }, { label: 'Use static list', id: 'static' }, { label: 'Use simulator', id: 'sim' }] });
        renderAll(); return;
      }
      if (event === 'history') { state.book.addHistory(payload.symbol, payload.prices, payload.times, payload.pipSize); updateActiveIfNeeded(payload.symbol); renderAll(); return; }
      if (event === 'tick') {
        const added = state.book.addTick(payload, now());
        const resolved = added ? resolveOpenSignals(payload.symbol) : false;
        const activeChanged = added ? updateActiveIfNeeded(payload.symbol) : false;
        if (resolved) renderAll(); else if (activeChanged) renderData(true);
        return;
      }
      if (event === 'symbol-error') { state.book.markUnavailable(payload.symbol, payload.code || payload.message); toast(payload.symbol + ' unavailable: ' + payload.message, 'warn'); renderAll(); return; }
      if (event === 'latency') { state.latency = Object.assign({}, state.latency, payload || {}); updatePills(); return; }
      if (event === 'error') {
        const text = (payload && (payload.message || payload.code)) || 'Feed error';
        toast(text, 'bad');
        if (/token|authoriz/i.test(String((payload && (payload.code || '')) + ' ' + text))) showBanner({ title: 'Deriv authorization failed', body: text, actions: [{ label: 'Open Settings', id: 'settings', primary: true }] });
      }
    }

    function stopFeed() {
      feedUnsubs.forEach(u => { try { u(); } catch (e) { /* best effort */ } }); feedUnsubs = [];
      if (feed && feed.stop) feed.stop(); feed = null; feedRunning = false;
    }
    function startFeed() {
      stopFeed();
      state.book = new modules.MarketBook(); state.active = null; state.activeStats = null; state.overview = [];
      resetPredict();
      state.feedStatus = { state: 'connecting', kind: state.settings.simulator ? 'sim' : 'live' };
      feed = makeFeed(state.settings); feedRunning = true;
      ['status', 'universe', 'universe-empty', 'history', 'tick', 'symbol-error', 'latency', 'error'].forEach(ev => { if (feed && feed.on) feedUnsubs.push(feed.on(ev, p => handleFeedEvent(ev, p))); });
      if (feed && feed.start) feed.start();
      updatePills(); renderAll();
    }

    function updateScanPhases(progress) {
      const activeIndex = Math.min(PHASE_LABELS.length - 1, Math.floor(progress * PHASE_LABELS.length));
      state.scan.phases = PHASE_LABELS.map((label, i) => ({ label, state: progress >= 1 || i < activeIndex ? 'done' : (i === activeIndex ? 'active' : 'waiting') }));
    }
    function stopScanTimer() { if (scanTimer != null) { clearIntervalFn(scanTimer); scanTimer = null; } }

    function finishScan() {
      stopScanTimer();
      if (state.scan.phase !== 'running') return;
      // The statistics run NOW, at the end of the animation, so the signal is built on the
      // freshest ticks and its validity countdown starts the moment the card is shown.
      const scanNow = now();
      state.book.refreshStale(scanNow);
      const result = modules.signals.scan(state.book.all(), state.settings, scanNow, feed ? feed.kind : 'live');
      state.lastScanAt = scanNow; state.scan.result = result;
      state.scan.phase = 'done'; state.scan.progress = 1; state.scan.remainingMs = 0;
      state.scan.phases = PHASE_LABELS.map(label => ({ label, state: 'done' }));
      if (result && result.type === 'signal') {
        const signal = result.signal; const market = state.book.get(signal.symbol);
        if (market) market.lastSignalAt = now();
        state.signal = signal; state.signals.push(signal); state.active = signal.symbol; state.settings.activeSymbol = signal.symbol;
        persistSettings(); persistSignals(); refreshMetrics(); refreshDerived(); resolveOpenSignals(signal.symbol); updateCountdown();
        toast('MATCH ' + signal.digit + ' on ' + signal.market, 'ok'); playSignalSound();
      } else {
        state.signal = null;
        const top = result && result.ranked && result.ranked[0];
        if (top) { state.active = top.symbol; state.settings.activeSymbol = top.symbol; persistSettings(); }
      }
      if (state.scan.navigateOnFinish) actions.navigate('signal'); else renderAll();
    }
    function runScanProgress() {
      if (state.scan.phase !== 'running') return;
      const elapsed = now() - state.scan.startedAt, duration = state.scan.durationMs;
      const progress = duration <= 0 ? 1 : Math.min(1, elapsed / duration);
      state.scan.progress = progress; state.scan.remainingMs = Math.max(0, duration - elapsed);
      updateScanPhases(progress);
      if (progress >= 1) { finishScan(); return; }
      const sc = root.MS.ui && root.MS.ui.scanner;
      if (state.page === 'scanner' && sc && sc.renderProgress) sc.renderProgress(state); else renderPage(state.page);
    }
    function updateCountdown() {
      if (!state.signal) return;
      state.countdown = { remainingSec: Math.max(0, (state.signal.expiresAt - now()) / 1000), totalSec: state.signal.validFor };
      renderCountdownOnly();
    }
    function tickScheduler() {
      if (!feedRunning) return;
      const nowMs = now();
      state.book.refreshStale(nowMs);
      let expiredNow = false;
      if (state.signal && !state.signal._expiryHandled && nowMs >= state.signal.expiresAt) {
        state.signal._expiryHandled = true; expiredNow = true;
        if (state.signal.status === 'live') modules.tracker.expireSignal(state.signal, nowMs);
        persistSignals(); refreshMetrics();
      }
      if (expiredNow) renderAll(); else renderData();
    }
    // ---------- manual MATCH / DIFFER prediction (Matches / Differs page) ----------
    // A prediction belongs to one market on one feed: switching either clears it (the record stays in Accuracy).
    function resetPredict() {
      if (predictTimer != null) { clearIntervalFn(predictTimer); predictTimer = null; }
      state.predict = { phase: 'idle', kind: null, progress: 0, steps: [], result: null, marketName: '' };
    }
    function finishPredict() {
      if (predictTimer != null) { clearIntervalFn(predictTimer); predictTimer = null; }
      const pr = state.predict; if (pr.phase !== 'running') return;
      const m = activeMarket(); if (!m) { pr.phase = 'idle'; renderPage('matches', true); return; }
      const ev = modules.signals.evaluateMarket(m, state.settings, now());
      const sig = modules.signals.makeManual(ev, state.settings, now(), feed ? feed.kind : 'live', pr.kind);
      state.signals.push(sig); persistSignals(); refreshMetrics(); resolveOpenSignals(sig.symbol);
      pr.phase = 'done'; pr.progress = 1; pr.steps = PREDICT_STEPS.map(label => ({ label, state: 'done' })); pr.result = sig;
      toast((pr.kind === 'differs' ? 'DIFFER ' : 'MATCH ') + sig.digit + ' on ' + sig.market, 'ok'); playSignalSound();
      renderPage('matches', true);
    }
    function runPredictProgress() {
      const pr = state.predict; if (pr.phase !== 'running') return;
      const elapsed = now() - pr.startedAt, duration = pr.durationMs;
      const progress = duration <= 0 ? 1 : Math.min(1, elapsed / duration);
      pr.progress = progress;
      const idx = Math.min(PREDICT_STEPS.length - 1, Math.floor(progress * PREDICT_STEPS.length));
      pr.steps = PREDICT_STEPS.map((label, i) => ({ label, state: progress >= 1 || i < idx ? 'done' : (i === idx ? 'active' : 'waiting') }));
      if (progress >= 1) { finishPredict(); return; }
      const ui = root.MS.ui && root.MS.ui.matches; if (state.page === 'matches' && ui && ui.renderProgress) ui.renderProgress(state); else renderPage(state.page);
    }

    function playSignalSound() {
      if (!state.settings.sound || !root.AudioContext) return;
      try {
        const ctx = new root.AudioContext(); const osc = ctx.createOscillator(); const gain = ctx.createGain();
        osc.frequency.value = 880; gain.gain.setValueAtTime(0.06, ctx.currentTime); osc.connect(gain); gain.connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + 0.12);
        osc.addEventListener('ended', () => ctx.close());
      } catch (e) { /* optional */ }
    }

    // ---------- splash ("initializing analysis engine") ----------
    function runSplash() {
      if (!doc) return;
      const wrap = doc.getElementById('splash'), bar = doc.getElementById('splash-bar'), pct = doc.getElementById('splash-pct');
      if (!wrap) return;
      const t0 = now(), dur = 1400;
      const step = () => {
        const p = Math.min(1, (now() - t0) / dur);
        if (bar) bar.style.width = (p * 100).toFixed(0) + '%';
        if (pct) pct.textContent = Math.round(p * 100) + '%';
        if (p < 1) setTimeoutFn(step, 40); else setTimeoutFn(() => { wrap.classList.add('out'); setTimeoutFn(() => { wrap.hidden = true; }, 350); }, 150);
      };
      step();
    }

    // ---------- session ----------
    async function loadProfile() {
      if (!auth) return true;
      const r = await auth.me();
      if (!r || !r.ok) { if (r && r.error === 'UNAUTHENTICATED') { await auth.logout(); return false; } toast(auth.msg(r && r.error), 'bad'); return !!state.profile; }
      state.profile = r.profile; state.account = { claims: r.claims, settings: r.settings, mailConfigured: r.mail_configured };
      renderChip();
      return true;
    }
    async function bootSession() {
      if (!auth) { startRuntime(); return; }
      const session = await auth.getSession();
      if (!session) { stopRuntime(); auth.hideAuthView(); showLanding(); return; }
      state.session = session;
      const ok = await loadProfile();
      if (!ok) { stopRuntime(); auth.hideAuthView(); showLanding(); return; }
      auth.hideAuthView();
      if (!premiumActive()) { stopFeed(); showLanding(); renderChip(); return; }
      hideLanding(); startRuntime();
      if (pageGate(state.page) !== 'ok') actions.navigate('dashboard'); else renderPage(state.page, true);
    }
    function startRuntime() {
      if (feedRunning) return;
      startFeed();
      if (tickTimer == null) tickTimer = setIntervalFn(tickScheduler, 1000);
      if (countdownTimer == null) countdownTimer = setIntervalFn(updateCountdown, 100);
      renderAll();
    }
    function stopRuntime() {
      stopScanTimer(); stopFeed();
      state.signal = null; state.profile = null; state.account = null; state.session = null;
      renderChip();
    }

    const actions = {
      navigate(page) {
        if (page === 'logout') { actions.logout(); return; }
        if (!ALL_PAGES.includes(page)) return;
        const gate = pageGate(page);
        if (gate === 'login') { if (auth) auth.showAuthView('login'); return; }
        if (gate === 'admin') { toast('Admin only', 'warn'); page = 'account'; }
        if (gate === 'premium' && !FORM_PAGES.includes(page)) { showLanding(); toast('Get access to open ' + page + '.', 'warn'); return; }
        hideLanding();
        state.page = page;
        const ui = shell(); if (ui) ui.setPage(page);
        refreshDerived(); updatePills(); renderPage(page, true);
      },
      setActive(symbol) { if (!state.book.get(symbol)) return; if (symbol !== state.active) resetPredict(); state.active = symbol; state.settings.activeSymbol = symbol; persistSettings(); refreshDerived(); renderAll(); },
      setFreq(patch) { state.freq = Object.assign({}, state.freq, patch || {}); renderPage('frequency', true); },
      setAccuracySource(source) { state.accuracySource = source; state.settings.accuracySource = source; persistSettings(); refreshMetrics(); renderPage('accuracy', true); },
      scan(options) {
        options = options || {};
        if (state.scan.phase === 'running') return;
        if (!premiumActive()) { toast('Scanning is a PREMIUM feature — see Upgrade.', 'warn'); return; }
        const scanNow = now();
        state.lastScanAt = scanNow; // guards against a second trigger while the animation runs
        const duration = Math.max(0, Number(state.settings.scanAnimMs) || 0);
        state.scan = { phase: 'running', progress: 0, remainingMs: duration, startedAt: scanNow, durationMs: duration, phases: idlePhases(), result: null, navigateOnFinish: options.from === 'signal' };
        updateScanPhases(0); renderAll();
        if (duration === 0) finishScan(); else scanTimer = setIntervalFn(runScanProgress, Math.min(100, Math.max(30, duration / 30)));
      },
      setSettings(patch, options) {
        options = options || {};
        const prior = state.settings;
        state.settings = Object.assign({}, modules.signals.DEFAULT_SETTINGS, state.settings, patch || {});
        state.accuracySource = state.settings.accuracySource || state.accuracySource;
        persistSettings(); refreshMetrics(); refreshDerived();
        const restart = options.reconnect || prior.simulator !== state.settings.simulator || prior.token !== state.settings.token || prior.appId !== state.settings.appId;
        if (restart && started && feedRunning) { state.signal = null; startFeed(); } else renderAll();
        if (state.page === 'settings') renderPage('settings', true);
      },
      resetSettings() { actions.setSettings(Object.assign({}, modules.signals.DEFAULT_SETTINGS), { reconnect: true }); },
      useToken() { actions.navigate('settings'); },
      useStatic() { if (feed && feed.useStaticList) feed.useStaticList(); else toast('Feed is not ready for a static-list request.', 'warn'); },
      useSim(on) { actions.setSettings({ simulator: on !== false }); },
      exportCsv() {
        if (!doc || !root.Blob || !root.URL || !root.URL.createObjectURL) return;
        const selected = state.accuracySource === 'all' ? state.signals : state.signals.filter(s => s.source === state.accuracySource);
        const blob = new root.Blob([modules.tracker.toCSV(selected)], { type: 'text/csv;charset=utf-8' });
        const url = root.URL.createObjectURL(blob); const a = doc.createElement('a'); a.href = url; a.download = 'binary-analysis-tool-signals.csv'; a.click();
        setTimeoutFn(() => root.URL.revokeObjectURL(url), 0);
      },
      clearHistory() { state.signals = []; state.signal = null; store.clearSignals(); refreshMetrics(); renderAll(); },
      toast,
      predict(kind) {
        if (state.predict.phase === 'running') return;
        if (!premiumActive()) { toast('Predictions are a PREMIUM feature — see Upgrade.', 'warn'); return; }
        const m = activeMarket(); if (!m || !m.ticks.length) { toast('Waiting for ticks on the active market.', 'warn'); return; }
        const duration = Math.max(0, Number(state.settings.scanAnimMs) || 0);
        state.predict = { phase: 'running', kind: kind === 'differs' ? 'differs' : 'matches', progress: 0, startedAt: now(), durationMs: duration, steps: PREDICT_STEPS.map(label => ({ label, state: 'waiting' })), result: null, marketName: m.name };
        renderPage('matches', true);
        if (duration === 0) finishPredict(); else predictTimer = setIntervalFn(runPredictProgress, Math.min(100, Math.max(30, duration / 30)));
      },
      // ---- accounts ----
      async logout() { if (!auth) return; await auth.logout(); stopRuntime(); state.page = 'dashboard'; const ui = shell(); if (ui) ui.setPage('dashboard'); showLanding(); toast('You are logged out.', 'info'); },
      // landing-page buttons
      landing(what) {
        if (what === 'login') { if (auth) auth.showAuthView('login'); return; }
        if (what === 'signup') { if (auth) auth.showAuthView('signup'); return; }
        if (what === 'open') { hideLanding(); if (!feedRunning) startRuntime(); actions.navigate('dashboard'); return; }
        if (what === 'accuracy' || what === 'upgrade' || what === 'account') actions.navigate(what);
      },
      async refreshAccount() { await loadProfile(); renderPage(state.page, true); },
      async activate(code) {
        if (!auth) return;
        const r = await auth.call('account', { action: 'activate', code });
        if (!r.ok) { toast(auth.msg(r.error), 'bad'); return; }
        await loadProfile(); toast('PREMIUM activated for ' + r.days + ' days ✓', 'ok');
        hideLanding(); if (!feedRunning) startRuntime();
        actions.navigate('account');
      },
      async claimPayment(p) {
        if (!auth) return;
        const r = await auth.call('account', Object.assign({ action: 'claim_payment' }, p));
        if (!r.ok) { toast(r.error === 'TOO_MANY_PENDING' ? 'You already have pending claims — wait for the owner to review them.' : auth.msg(r.error), 'bad'); return; }
        await loadProfile(); toast(r.owner_notified ? 'Claim sent — the owner has been emailed.' : 'Claim recorded — message the owner on WhatsApp to speed it up.', 'ok');
        renderPage('upgrade', true);
      },
      async admin(payload) { if (!auth) return { ok: false, error: 'FORBIDDEN' }; return auth.call('admin', payload); }
    };

    const api = {
      state, actions,
      start() {
        if (started) return api;
        started = true;
        state.settings = Object.assign({}, modules.signals.DEFAULT_SETTINGS, store.loadSettings());
        state.signals = store.loadSignals();
        state.accuracySource = state.settings.accuracySource || 'all';
        state.storeAvailable = !!store.available;
        state.lastScanAt = now();
        refreshMetrics(); mountUi(); runSplash();
        if (auth && doc) {
          try { auth.init(); } catch (e) { showBanner({ title: 'Accounts are unavailable', body: 'The sign-in library failed to load. Check your internet connection and reload.', actions: [] }); return api; }
          auth.mountAuthView(doc.getElementById('auth-view'), { onSignedIn: () => bootSession() });
          auth.onChange((event) => { if (event === 'SIGNED_OUT') { stopRuntime(); showLanding(); } });
          bootSession();
        } else if (!auth) {
          startRuntime();
        }
        return api;
      },
      stop() {
        started = false; stopScanTimer(); if (predictTimer != null) { clearIntervalFn(predictTimer); predictTimer = null; }
        if (tickTimer != null) { clearIntervalFn(tickTimer); tickTimer = null; }
        if (countdownTimer != null) { clearIntervalFn(countdownTimer); countdownTimer = null; }
        stopFeed();
      },
      renderAll
    };
    return api;
  }

  const api = { createApp, nextScanDelayMs, PHASE_LABELS };
  if (!isNode && root.document) {
    const boot = () => { if (!root.__matchesSniperApp) root.__matchesSniperApp = createApp(); root.__matchesSniperApp.start(); };
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
  }
  return api;
});

// matches-sniper/js/ui/scanner.js — scan all markets (reference tool B): cycling market selector, spinner with the
// current phase, auto-selecting caption, progress, then the AUTO-SELECTED MARKET card
(function (root) {
  'use strict';
  const C = root.MS.ui.components;
  let el = null, act = null;

  function cyclingIndex(state, markets) {
    return markets.length ? Math.floor((state.scan.progress || 0) * markets.length * 1.5) % markets.length : 0;
  }

  function marketSelector(state) {
    const markets = state.book.all();
    const running = state.scan && state.scan.phase === 'running';
    // while scanning, the dropdown visibly walks through the universe (as in the reference tool)
    const idx = running ? cyclingIndex(state, markets) : Math.max(0, markets.findIndex(m => m.symbol === state.active));
    return '<div class="field"><div class="row between"><label for="scan-market">Select volatility market</label>' + (running ? C.pill('◌ SELECTING', 'info selecting') : '') + '</div>'
      + '<select id="scan-market"' + (running ? ' disabled' : '') + ' aria-label="Volatility market">'
      + markets.map((m, i) => '<option value="' + C.esc(m.symbol) + '"' + (i === idx ? ' selected' : '') + '>' + C.esc(m.name) + '</option>').join('') + '</select></div>';
  }

  function scanButton(state) {
    const running = state.scan && state.scan.phase === 'running';
    return '<button type="button" class="btn primary wide scan-btn" data-act="scan"' + (running ? ' disabled' : '') + '>' + (running ? '<span class="spin-ic" aria-hidden="true">◌</span> SCANNING' : '<span aria-hidden="true">⊡</span> SCAN VOLATILITY') + '</button>'
      + '<div class="scan-line' + (running ? ' on' : '') + '"><div id="scan-line" style="width:' + (running ? ((state.scan.progress || 0) * 100).toFixed(1) : 0) + '%"></div></div>';
  }

  function statusPanel(state) {
    const scan = state.scan, markets = state.book.all();
    if (!scan || scan.phase !== 'running') {
      return '<div class="scan-panel"><span class="pill status">READY TO SCAN</span>'
        + '<p>Press <b>Scan Volatility</b> to pull recent ticks from all ' + (markets.length || 'the') + ' volatility markets, rank them by digit deviation and auto-select the strongest one. The choice applies to every market dropdown in the app.</p></div>';
    }
    const active = scan.phases.find(p => p.state === 'active') || scan.phases[scan.phases.length - 1];
    const cycling = markets.length ? markets[cyclingIndex(state, markets)].name : '…';
    return '<div class="scan-panel"><div class="scan-spinner" aria-hidden="true"><span>⚄</span></div>'
      + '<div class="scan-title" id="scan-title">' + C.esc(active ? active.label : 'Scanning') + '</div>'
      + '<div class="scan-sub">Auto-selecting: <span id="scan-cycling">' + C.esc(cycling) + '</span></div>'
      + '<div class="progress"><div id="scan-bar" style="width:' + ((scan.progress || 0) * 100).toFixed(1) + '%"></div></div><div class="scan-pct" id="scan-pct">' + Math.round((scan.progress || 0) * 100) + '%</div></div>';
  }

  function autoCard(state) {
    const r = state.scan && state.scan.phase === 'done' ? state.scan.result : null;
    if (!r || !r.ranked || !r.ranked.length) return '';
    const top = r.type === 'signal' ? r.ranked.find(e => e.symbol === r.signal.symbol) : r.ranked[0];
    return '<div class="card auto-card"><div class="card-head"><div class="row"><span class="pill ok">AUTO-SELECTED MARKET</span><span class="rank-badge">RANK #' + top.rank + ' OF ' + top.universeSize + '</span></div></div>'
      + '<h3 class="auto-name">' + C.esc(top.name) + '</h3>'
      + '<p class="intro">' + (r.type === 'signal' ? 'Chosen for the strongest digit deviation that also passes every sniper gate. Now active in every market dropdown.' : 'Chosen for the strongest digit deviation right now (no market passed every sniper gate yet). Now active in every market dropdown.') + '</p>'
      + '<div class="tiles"><div class="tile"><div class="l">Deviation score</div><div class="v">' + top.stats.chi2.toFixed(2) + '</div></div>'
      + '<div class="tile"><div class="l">Sample size</div><div class="v">' + top.stats.n + '</div></div>'
      + '<div class="tile"><div class="l">Market activity</div><div class="v">' + top.stats.tps.toFixed(2) + ' t/s</div></div>'
      + '<div class="tile"><div class="l">Status</div><div class="v ok-t">● Applied</div></div></div></div>';
  }

  function render(state) {
    if (!el) return;
    const running = state.scan && state.scan.phase === 'running';
    el.innerHTML = C.pageTitle('⊡', 'Volatility scanner', 'Scan every volatility market, rank them by digit deviation, then auto-select the strongest one across the app')
      + '<div class="card">' + marketSelector(state) + scanButton(state) + statusPanel(state) + '</div>' + autoCard(state);
    el.querySelector('[data-act="scan"]').addEventListener('click', () => act.scan({ from: 'scanner' }));
    const sel = el.querySelector('#scan-market'); if (sel && !running) sel.addEventListener('change', (e) => act.setActive(e.target.value));
  }

  // partial update during the scan animation: progress, phase title and the cycling dropdown only
  function renderProgress(state) {
    if (!el || !state.scan || state.scan.phase !== 'running' || !el.querySelector('#scan-bar')) { render(state); return; }
    const s = state.scan, p = ((s.progress || 0) * 100).toFixed(1) + '%';
    el.querySelector('#scan-bar').style.width = p;
    const line = el.querySelector('#scan-line'); if (line) line.style.width = p;
    const pct = el.querySelector('#scan-pct'); if (pct) pct.textContent = Math.round((s.progress || 0) * 100) + '%';
    const active = s.phases.find(x => x.state === 'active') || s.phases[s.phases.length - 1];
    const title = el.querySelector('#scan-title'); if (title && active && title.textContent !== active.label) title.textContent = active.label;
    const sel = el.querySelector('#scan-market');
    if (sel && sel.options.length) {
      const idx = Math.floor((s.progress || 0) * sel.options.length * 1.5) % sel.options.length;
      if (sel.selectedIndex !== idx) { sel.selectedIndex = idx; const cyc = el.querySelector('#scan-cycling'); if (cyc) cyc.textContent = sel.options[idx].text; }
    }
  }

  root.MS.ui.scanner = { mount(rootEl, actions) { el = rootEl; act = actions; }, render, renderProgress };
})(typeof globalThis !== 'undefined' ? globalThis : this);

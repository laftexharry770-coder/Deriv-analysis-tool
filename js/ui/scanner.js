// matches-sniper/js/ui/scanner.js — scan all markets: cycling market selector, matrix sweep, phases, ranking, auto-selected card
(function (root) {
  'use strict';
  const C = root.MS.ui.components;
  let el = null, act = null, rain = null;

  // ---- matrix "deep scan" effect (Tool A) — falling digits on a canvas while the scan runs
  function startRain(canvas) {
    stopRain();
    if (!canvas || !canvas.getContext) return;
    const ctx = canvas.getContext('2d');
    const resize = () => { canvas.width = canvas.clientWidth * (root.devicePixelRatio || 1); canvas.height = canvas.clientHeight * (root.devicePixelRatio || 1); };
    resize();
    const dpr = root.devicePixelRatio || 1, fs = 14 * dpr, cols = Math.max(1, Math.floor(canvas.width / fs));
    const drops = Array.from({ length: cols }, () => Math.random() * -40);
    const accent = getComputedStyle(root.document.documentElement).getPropertyValue('--accent').trim() || '#5aa9ff';
    let last = 0;
    const frame = (t) => {
      if (!rain) return;
      if (t - last > 45) {
        last = t;
        ctx.fillStyle = 'rgba(11, 19, 36, 0.18)'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.font = fs + 'px ui-monospace, Consolas, monospace'; ctx.textBaseline = 'top';
        for (let i = 0; i < cols; i++) {
          const y = drops[i] * fs;
          ctx.fillStyle = Math.random() < 0.08 ? '#ffffff' : accent;
          ctx.fillText(String(Math.floor(Math.random() * 10)), i * fs, y);
          if (y > canvas.height && Math.random() > 0.975) drops[i] = 0; else drops[i] += 1;
        }
      }
      rain.raf = root.requestAnimationFrame(frame);
    };
    rain = { canvas, raf: root.requestAnimationFrame(frame) };
  }
  function stopRain() { if (rain && rain.raf) root.cancelAnimationFrame(rain.raf); rain = null; }

  function marketSelector(state) {
    const markets = state.book.all();
    const running = state.scan && state.scan.phase === 'running';
    // while scanning, the dropdown visibly walks through the universe (as in the reference tool)
    const idx = running && markets.length ? Math.floor((state.scan.progress || 0) * markets.length * 1.5) % markets.length : Math.max(0, markets.findIndex(m => m.symbol === state.active));
    return '<div class="field"><label>Select volatility market</label><div class="row"><select id="scan-market" ' + (running ? 'disabled' : '') + ' aria-label="Volatility market">'
      + markets.map((m, i) => '<option value="' + C.esc(m.symbol) + '"' + (i === idx ? ' selected' : '') + '>' + C.esc(m.name) + '</option>').join('') + '</select>'
      + (running ? C.pill('SELECTING', 'info') : C.pill(markets.length + ' MARKETS', 'info')) + '</div></div>';
  }

  function phases(scan) {
    if (!scan || scan.phase === 'idle') return '<div class="muted small" style="margin-top:10px">Ready to scan. Press the button to pull recent ticks from every volatility market, rank them by digit deviation and lock the strongest sniper setup.</div>';
    const left = Math.max(0, (scan.remainingMs || 0) / 1000);
    return (scan.phase === 'running' ? '<div class="matrix-wrap"><canvas id="scan-rain" class="matrix" aria-hidden="true"></canvas><div class="matrix-label"><span>MATRIX DEEP SCAN</span><span id="scan-pct">' + Math.round((scan.progress || 0) * 100) + '%</span></div></div>' : '')
      + '<ul class="scan-phases" id="scan-phases">' + scan.phases.map(p => '<li class="' + p.state + '">' + C.esc(p.label) + '</li>').join('') + '</ul>'
      + '<div class="progress"><div id="scan-bar" style="width:' + ((scan.progress || 0) * 100).toFixed(1) + '%"></div></div>'
      + '<div class="progress-meta"><span id="scan-state">' + (scan.phase === 'running' ? 'Auto-selecting: ' + C.esc(scan.cycling || '…') : 'Scan complete') + '</span><span id="scan-left">' + (scan.phase === 'running' ? left.toFixed(1) + 's left' : '100%') + '</span></div>';
  }

  function autoCard(state) {
    const r = state.scan && state.scan.phase === 'done' ? state.scan.result : null;
    if (!r || !r.ranked || !r.ranked.length) return '';
    const top = r.type === 'signal' ? r.ranked.find(e => e.symbol === r.signal.symbol) : r.ranked[0];
    const m = state.book.get(top.symbol);
    return '<div class="card auto-card"><div class="card-head"><div class="row"><span class="pill ok">AUTO-SELECTED MARKET</span><span class="rank-badge">RANK #' + top.rank + ' OF ' + top.universeSize + '</span></div></div>'
      + '<h3 style="font-size:20px">' + C.esc(top.name) + '</h3>'
      + '<p class="intro">' + (r.type === 'signal' ? 'Chosen for the strongest digit deviation that also passes every sniper gate. Now active in every market dropdown.' : 'Chosen for the strongest digit deviation right now (no market passed every sniper gate yet). Now active in every market dropdown.') + '</p>'
      + '<div class="tiles"><div class="tile"><div class="l">Deviation score</div><div class="v">' + top.stats.chi2.toFixed(2) + '</div></div>'
      + '<div class="tile"><div class="l">Sample size</div><div class="v">' + top.stats.n + '</div></div>'
      + '<div class="tile"><div class="l">Market activity</div><div class="v">' + top.stats.tps.toFixed(2) + ' t/s</div></div>'
      + '<div class="tile"><div class="l">Status</div><div class="v ok-t">Applied</div></div></div>'
      + (r.type === 'signal' ? '<div class="row" style="margin-top:10px"><button type="button" class="btn primary" data-act="open-signal">Open the MATCH ' + r.signal.digit + ' signal →</button><button type="button" class="btn" data-act="open-matches">Matches / Differs</button></div>' : '<div class="row" style="margin-top:10px"><button type="button" class="btn primary" data-act="open-matches">Open Matches / Differs →</button></div>')
      + (m && m.lagEma != null ? '<div class="meta-line" style="margin-top:8px">feed lag ' + Math.round(m.lagEma * 1000) + ' ms · hot digit ' + top.digit + ' · z ' + top.stats.zFull[top.digit].toFixed(2) + '</div>' : '') + '</div>';
  }

  function rankTable(state) {
    const r = state.scan && state.scan.phase === 'done' ? state.scan.result : null;
    const ranked = r ? r.ranked : [];
    const rows = ranked.map(e => [
      '<span class="num">#' + e.rank + '</span>', C.esc(e.name), '<span class="num">' + e.stats.deviationScore.toFixed(0) + ' <span class="muted">(' + e.stats.chi2.toFixed(1) + ')</span></span>',
      e.digit == null ? '–' : '<span class="num ok-t">' + e.digit + '</span>', e.digit == null ? '–' : '<span class="num">' + e.stats.zFull[e.digit].toFixed(2) + ' / ' + e.stats.zRecent[e.digit].toFixed(2) + '</span>',
      '<span class="num">' + e.stats.n + '</span>', '<span class="num">' + e.stats.tps.toFixed(2) + '</span>',
      e.pass ? '<span class="ok-t">all gates ✓</span>' : '<span class="bad-t">✗ ' + C.esc(e.failed.join(', ')) + '</span>'
    ]);
    return '<div class="card"><div class="card-head"><h3>Ranking by digit deviation</h3><div class="sub">tap a row to make it active</div></div>'
      + C.table(['Rank', 'Market', 'Dev score', 'Hot', 'z full / recent', 'Sample', 't/s', 'Gates'], rows, { empty: 'Run a scan to rank the markets', rowAttrs: (i) => 'data-symbol="' + C.esc(ranked[i].symbol) + '"' + (ranked[i].symbol === state.active ? ' class="active"' : '') }) + '</div>';
  }

  function render(state) {
    if (!el) return;
    const running = state.scan && state.scan.phase === 'running';
    el.innerHTML = C.pageTitle('◎', 'Volatility scanner', 'Scan every volatility market, rank them by digit deviation, then auto-select the strongest setup')
      + '<div class="card">' + marketSelector(state)
      + '<button type="button" class="btn primary wide" data-act="scan"' + (running ? ' disabled' : '') + '>' + (running ? 'Scanning…' : 'Scan volatility markets') + '</button>' + phases(state.scan) + '</div>'
      + autoCard(state) + rankTable(state);
    el.querySelector('[data-act="scan"]').addEventListener('click', () => act.scan({ from: 'scanner' }));
    const os = el.querySelector('[data-act="open-signal"]'); if (os) os.addEventListener('click', () => act.navigate('signal'));
    const om = el.querySelector('[data-act="open-matches"]'); if (om) om.addEventListener('click', () => act.navigate('matches'));
    const sel = el.querySelector('#scan-market'); if (sel && !running) sel.addEventListener('change', (e) => act.setActive(e.target.value));
    el.querySelectorAll('tr[data-symbol]').forEach(tr => tr.addEventListener('click', () => act.setActive(tr.getAttribute('data-symbol'))));
    if (running) startRain(el.querySelector('#scan-rain')); else stopRain();
  }

  // partial update during the scan animation (keeps the canvas alive instead of rebuilding the page)
  function renderProgress(state) {
    if (!el || !state.scan || state.scan.phase !== 'running' || !el.querySelector('#scan-bar')) { render(state); return; }
    const s = state.scan;
    el.querySelector('#scan-bar').style.width = ((s.progress || 0) * 100).toFixed(1) + '%';
    const pct = el.querySelector('#scan-pct'); if (pct) pct.textContent = Math.round((s.progress || 0) * 100) + '%';
    const left = el.querySelector('#scan-left'); if (left) left.textContent = Math.max(0, (s.remainingMs || 0) / 1000).toFixed(1) + 's left';
    const lis = el.querySelectorAll('#scan-phases li'); s.phases.forEach((p, i) => { if (lis[i]) lis[i].className = p.state; });
    const sel = el.querySelector('#scan-market'); if (sel && sel.options.length) { sel.selectedIndex = Math.floor((s.progress || 0) * sel.options.length * 1.5) % sel.options.length; const st = el.querySelector('#scan-state'); if (st) st.textContent = 'Auto-selecting: ' + sel.options[sel.selectedIndex].text; }
  }

  root.MS.ui.scanner = { mount(rootEl, actions) { el = rootEl; act = actions; }, render, renderProgress };
})(typeof globalThis !== 'undefined' ? globalThis : this);

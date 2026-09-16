// matches-sniper/js/ui/matches.js — Matches / Differs module (reference tool B): live digit stream, MATCH / DIFFER
// prediction with the "Analyzing match pattern" checklist, digit chart, analysis settings
(function (root) {
  'use strict';
  const C = root.MS.ui.components, util = root.MS.util;
  let el = null, act = null;

  function activeStats(state) { return state.activeStats; }
  function market(state) { return state.active ? state.book.get(state.active) : null; }

  function marketSelect(state) {
    return '<div class="field"><label for="md-market">Select volatility market</label><select id="md-market">' + state.book.all().map(m => '<option value="' + C.esc(m.symbol) + '"' + (m.symbol === state.active ? ' selected' : '') + '>' + C.esc(m.name) + '</option>').join('') + '</select></div>';
  }

  function chart(state) {
    const st = activeStats(state), m = market(state);
    if (!m || !st || !st.n) return '<div class="muted small">Waiting for ticks…</div>';
    const even = [0, 2, 4, 6, 8].reduce((a, d) => a + st.counts[d], 0) / st.n;
    return '<div class="row between" style="margin:8px 0"><div><div class="kpi-l">Active market</div><div class="mono" style="font-weight:700">' + C.esc(m.name) + '</div></div><div class="chips"><span class="chip">EVEN ' + C.pct(even) + '</span><span class="chip">ODD ' + C.pct(1 - even) + '</span></div></div>'
      + '<div class="kpi-l" style="margin:6px 0">Digit chart · appearance rate over the last ' + st.n + ' ticks</div>' + C.digitCircles(st, { lastDigit: st.lastDigit })
      + '<div class="legend"><span><i style="background:var(--accent)"></i>Highest</span><span><i style="background:var(--surface-2);border:1px solid var(--border-2)"></i>Normal</span><span><i style="background:var(--border-2)"></i>Lowest</span><span><i style="background:var(--amber)"></i>Last tick</span></div>'
      + '<div class="card-head" style="margin-top:14px"><h3>Digit frequency</h3><div class="sub">' + st.n + ' ticks · last ' + st.nR + ' weighed as the recent window</div></div>' + C.digitBars(st, { highlight: st.hot })
      + '<div class="legend"><span><i style="background:var(--bar-above)"></i>Above baseline</span><span><i style="background:var(--bar-normal)"></i>Normal</span><span><i style="background:var(--bar-below)"></i>Below baseline</span><span><i style="border-top:1px dashed var(--amber);height:0;width:12px"></i>10% uniform baseline</span></div>';
  }

  function liveStream(state) {
    const st = activeStats(state), m = market(state);
    const sim = state.feedStatus && state.feedStatus.kind === 'sim';
    const pr = state.predict || { phase: 'idle' };
    const running = pr.phase === 'running';
    const strip = m && st && st.n ? C.tickStrip(m, st, { simulated: sim }) : '<div class="strip"><div class="strip-head"><span>' + (sim ? 'SIMULATED TICK FEED' : 'DERIV TICK FEED') + '</span><span>waiting for ticks…</span></div></div>';
    return '<div class="card"><div class="card-head"><span class="pill status">LIVE DIGIT STREAM</span><span class="sub">the circle follows the latest tick</span></div>' + strip
      + '<div class="pred-row"><button type="button" class="btn pred-btn" data-predict="differs"' + (running ? ' disabled' : '') + '>DIFFER</button>'
      + '<div class="live-circle" id="md-live"><span>' + (st && st.lastDigit != null ? st.lastDigit : '–') + '</span></div>'
      + '<button type="button" class="btn primary pred-btn" data-predict="matches"' + (running ? ' disabled' : '') + '>MATCH</button></div>'
      + '<div class="range-row"><span class="kpi-l">Prediction range</span>' + [1, 2, 3, 4, 5].map(n => '<button type="button" class="range-chip' + (Number(state.settings.horizonTicks) === n ? ' on' : '') + '" data-range="' + n + '">' + n + '</button>').join('') + '<span class="muted small">ticks</span></div>'
      + '<div class="muted small" style="text-align:center;margin-top:6px">The circle follows the latest tick. Press Differ or Match to lock a prediction on ' + C.esc(m ? m.name : 'the active market') + '.</div></div>';
  }

  function prediction(state) {
    const pr = state.predict; const st = activeStats(state);
    if (!pr || pr.phase === 'idle') return '';
    const recent = st && st.last5 ? st.last5 : [];
    let h = '<div class="card pred-card"><div class="card-head"><span class="pill status">' + (pr.kind === 'differs' ? 'DIFFER PREDICTION' : 'MATCH PREDICTION') + '</span><span class="sub">' + C.esc(pr.marketName || '') + '</span></div>'
      + '<div class="digit-row">' + recent.map(d => '<span>' + d + '</span>').join('') + '</div>';
    if (pr.phase === 'running') {
      h += '<div class="kpi-l" style="margin-top:10px">Analyzing ' + (pr.kind === 'differs' ? 'differ' : 'match') + ' pattern</div><ul class="scan-phases" id="md-steps">' + pr.steps.map(p => '<li class="' + p.state + '">' + C.esc(p.label) + '</li>').join('') + '</ul>'
        + '<div class="progress"><div id="md-bar" style="width:' + ((pr.progress || 0) * 100).toFixed(1) + '%"></div></div><div class="progress-meta"><span>Analyzing…</span><span id="md-pct">' + Math.round((pr.progress || 0) * 100) + '%</span></div>';
    } else if (pr.result) {
      const s = pr.result;
      const open = s.outcome == null && s.status === 'live';
      h += '<div class="pred-result"><div class="digit-big">' + s.digit + '</div><div><div class="market-name">' + (s.contract === 'differs' ? 'DIFFER ' : 'MATCH ') + s.digit + '</div><div class="market-sym">' + C.esc(s.symbol) + ' · ' + C.esc(s.mode) + ' mode · horizon ' + s.horizonTicks + ' tick' + (s.horizonTicks > 1 ? 's' : '') + '</div>'
        + '<div class="headline" style="margin-top:6px"><div><span class="str-l">Signal strength</span><span class="str-v">' + s.strength.toFixed(1) + '</span></div><div class="prob">est. probability <b>' + C.pct(s.probEst) + '</b> vs ' + (s.contract === 'differs' ? '90%' : '10%') + ' base</div></div></div></div>'
        + C.bandBar(s.strength) + '<div class="reason" style="margin-top:8px">' + C.esc(s.reason) + '</div>'
        + '<div class="row" style="margin-top:6px">' + (s.outcome ? C.pill(s.outcome.toUpperCase() + ' · outcome digit ' + s.resolvedDigit, s.outcome === 'win' ? 'ok' : 'bad') : C.pill(open ? 'PENDING · scored on the next ' + s.horizonTicks + ' tick' + (s.horizonTicks > 1 ? 's' : '') : 'PENDING', 'warn')) + '<span class="muted small">recorded in Accuracy as a manual ' + (s.contract === 'differs' ? 'Differs' : 'Matches') + ' call</span></div>';
    }
    return h + '</div>';
  }

  function settingsCard(state) {
    const s = state.settings;
    return '<div class="card"><div class="card-head"><h3>Analysis settings</h3><div class="sub">statistical analysis over the last ' + s.window + ' ticks of ' + (state.feedStatus && state.feedStatus.kind === 'sim' ? 'simulated' : 'real Deriv') + ' data — strength and probability are both calculated from that sample</div></div><div class="field-row">'
      + '<div class="field"><label for="md-sample">Sample size</label><select id="md-sample">' + [100, 200, 300, 500].map(n => '<option value="' + n + '"' + (Number(s.window) === n ? ' selected' : '') + '>' + n + ' ticks</option>').join('') + '</select></div>'
      + '<div class="field"><label for="md-market2">Market</label><select id="md-market2">' + state.book.all().map(m => '<option value="' + C.esc(m.symbol) + '"' + (m.symbol === state.active ? ' selected' : '') + '>' + C.esc(m.name) + '</option>').join('') + '</select></div>'
      + '<div class="field"><label for="md-duration">Contract duration</label><select id="md-duration">' + [1, 3, 5].map(n => '<option value="' + n + '"' + (Number(s.horizonTicks) === n ? ' selected' : '') + '>' + n + ' tick' + (n > 1 ? 's' : '') + '</option>').join('') + '</select></div>'
      + '<div class="field"><label>Analysis mode</label><div class="segmented"><button type="button" data-mode="standard" class="' + (s.mode === 'standard' ? 'on' : '') + '">◇ Standard</button><button type="button" data-mode="pro" class="' + (s.mode === 'pro' ? 'on' : '') + '">◈ Pro</button></div></div>'
      + '<div class="field"><label for="md-dur">Analysis duration</label><select id="md-dur">' + [[0, 'instant'], [2000, '~2s'], [3500, '~4s'], [6000, '~6s']].map(([v, l]) => '<option value="' + v + '"' + (Number(s.scanAnimMs) === v ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></div></div>'
      + (s.mode === 'pro' ? '<div class="banner" style="margin-top:10px"><div class="banner-title">Pro analysis is active</div><div class="banner-body">Deeper statistical filtering: Pro weights the most recent 60% of the sample more heavily when ranking digits.</div></div>' : '<div class="controls" style="margin-top:10px"><button type="button" class="btn" data-mode="pro">Activate Pro analysis</button><span class="muted small">weights the most recent 60% of the sample more heavily</span></div>') + '</div>';
  }

  function render(state) {
    if (!el) return;
    el.innerHTML = C.pageTitle('◈', 'Matches / Differs', 'Find the most frequent digit in recent ticks and read how likely the next tick is to repeat it')
      + '<div class="card">' + marketSelect(state) + chart(state) + '</div>' + liveStream(state) + prediction(state) + settingsCard(state);
    el.querySelector('#md-market').addEventListener('change', (e) => act.setActive(e.target.value));
    el.querySelectorAll('[data-predict]').forEach(b => b.addEventListener('click', () => act.predict(b.getAttribute('data-predict'))));
    el.querySelectorAll('[data-range]').forEach(b => b.addEventListener('click', () => act.setSettings({ horizonTicks: Number(b.getAttribute('data-range')) })));
    el.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => act.setSettings({ mode: b.getAttribute('data-mode') })));
    el.querySelector('#md-duration').addEventListener('change', (e) => act.setSettings({ horizonTicks: Number(e.target.value) }));
    el.querySelector('#md-dur').addEventListener('change', (e) => act.setSettings({ scanAnimMs: Number(e.target.value) }));
    el.querySelector('#md-sample').addEventListener('change', (e) => act.setSettings({ window: Number(e.target.value) }));
    el.querySelector('#md-market2').addEventListener('change', (e) => act.setActive(e.target.value));
  }

  // per-tick partial update: latest digit circle + tick strip, without rebuilding the forms
  function renderLive(state) {
    if (!el) return;
    const st = activeStats(state), m = market(state);
    const c = el.querySelector('#md-live span'); if (c && st) c.textContent = st.lastDigit == null ? '–' : st.lastDigit;
    const strip = el.querySelector('.strip'); if (strip && m && st && st.n) strip.outerHTML = C.tickStrip(m, st, { simulated: state.feedStatus && state.feedStatus.kind === 'sim' });
    if (state.predict && state.predict.phase === 'done' && state.predict.result && state.predict.result.outcome && !el.querySelector('.pred-card .pill.ok, .pred-card .pill.bad')) render(state);
  }
  function renderProgress(state) {
    if (!el || !state.predict || state.predict.phase !== 'running' || !el.querySelector('#md-bar')) { render(state); return; }
    const pr = state.predict;
    el.querySelector('#md-bar').style.width = ((pr.progress || 0) * 100).toFixed(1) + '%';
    const pct = el.querySelector('#md-pct'); if (pct) pct.textContent = Math.round((pr.progress || 0) * 100) + '%';
    const lis = el.querySelectorAll('#md-steps li'); pr.steps.forEach((p, i) => { if (lis[i]) lis[i].className = p.state; });
  }

  root.MS.ui.matches = { mount(rootEl, actions) { el = rootEl; act = actions; }, render, renderLive, renderProgress };
})(typeof globalThis !== 'undefined' ? globalThis : this);

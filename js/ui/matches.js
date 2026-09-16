// matches-sniper/js/ui/matches.js — Matches / Differs module (reference tool B): digit chart, analysis settings with the
// Synchronized Pro card, live digit stream with DIFFER / MATCH, prediction checklist and the locked result
(function (root) {
  'use strict';
  const C = root.MS.ui.components;
  let el = null, act = null;

  function activeStats(state) { return state.activeStats; }
  function market(state) { return state.active ? state.book.get(state.active) : null; }
  function lockedResult(state) { const pr = state.predict; return pr && pr.phase === 'done' && pr.result ? pr.result : null; }
  function circleLocked(state) { const r = lockedResult(state); return r && r.outcome == null ? r : null; }

  function marketOptions(state) {
    return state.book.all().map(m => '<option value="' + C.esc(m.symbol) + '"' + (m.symbol === state.active ? ' selected' : '') + '>' + C.esc(m.name) + '</option>').join('');
  }

  function chart(state) {
    const st = activeStats(state), m = market(state);
    if (!m || !st || !st.n) return '<div class="muted small">Waiting for ticks…</div>';
    const even = [0, 2, 4, 6, 8].reduce((a, d) => a + st.counts[d], 0) / st.n;
    return '<div class="row between" style="margin:8px 0"><div><div class="kpi-l">Active market</div><div class="mono" style="font-weight:700">' + C.esc(m.name) + '</div></div><div class="chips"><span class="chip">EVEN ' + C.pct(even) + '</span><span class="chip">ODD ' + C.pct(1 - even) + '</span></div></div>'
      + '<div class="kpi-l" style="margin:6px 0">Digit chart · appearance rate over the last ' + st.n + ' ticks · <span id="md-updated">updated just now</span></div>' + C.digitCircles(st, { lastDigit: st.lastDigit })
      + '<div class="chart-note">ARROW MARKS THE LATEST TICK · 10.0% IS THE UNIFORM BASELINE</div>'
      + '<div class="legend"><span><i style="background:var(--accent)"></i>Highest</span><span><i style="background:var(--surface-2);border:1px solid var(--border-2)"></i>Normal</span><span><i style="background:var(--border-2)"></i>Lowest</span><span><i style="background:var(--amber)"></i>Last tick</span></div>'
      + '<div class="card-head" style="margin-top:14px"><h3>Digit frequency</h3><div class="sub">' + st.n + ' ticks · last ' + st.nR + ' weighed as the recent window</div></div>' + C.digitBars(st, { highlight: st.hot })
      + '<div class="legend"><span><i style="background:var(--bar-above)"></i>Above baseline</span><span><i style="background:var(--bar-normal)"></i>Normal</span><span><i style="background:var(--bar-below)"></i>Below baseline</span><span><i style="border-top:1px dashed var(--amber);height:0;width:12px"></i>10% uniform baseline</span></div>';
  }

  function settingsCard(state) {
    const s = state.settings, pro = s.mode === 'pro', bot = !!s.proBot;
    return '<div class="card"><div class="card-head"><h3>Analysis settings</h3><div class="sub">statistical analysis over the last ' + s.window + ' ticks of ' + (state.feedStatus && state.feedStatus.kind === 'sim' ? 'simulated' : 'real Deriv') + ' data — strength and probability are both calculated from that sample</div></div>'
      + '<div class="field"><label for="md-sample">Sample size</label><select id="md-sample">' + [100, 200, 250, 300, 500].map(n => '<option value="' + n + '"' + (Number(s.window) === n ? ' selected' : '') + '>' + n + ' ticks</option>').join('') + '</select></div>'
      + '<div class="field"><label>Analysis mode</label><div class="segmented wide"><button type="button" data-mode="standard" class="' + (pro ? '' : 'on') + '">⚡ STANDARD</button><button type="button" data-mode="pro" class="' + (pro ? 'on' : '') + '">✦ PRO</button></div></div>'
      + '<div class="field"><label for="md-market2">Market</label><select id="md-market2">' + marketOptions(state) + '</select></div>'
      + '<div class="field"><label for="md-dur">Analysis duration</label><select id="md-dur">' + [[0, 'instant'], [2000, '~2s'], [3500, '~4s'], [6000, '~6s']].map(([v, l]) => '<option value="' + v + '"' + (Number(s.scanAnimMs) === v ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></div>'
      + '<div class="pro-card"><div class="row between"><div class="row"><span class="mod-ic">✦</span><b>SYNCHRONIZED PRO BOT</b></div>' + (bot ? C.pill('BOT ACTIVE', 'ok') : C.pill('BOT NOT ACTIVATED', 'warn')) + '</div>'
      + (bot ? '<div class="pro-note"><span>●</span> Pro Bot is active. Deeper statistical filtering and synchronized analysis enabled.</div>'
        : '<button type="button" class="btn primary wide" style="margin-top:10px" data-activate="1">⚡ ACTIVATE BOT</button>')
      + '<div class="muted small" style="margin-top:8px">Pro weights the most recent 60% of the sample more heavily when ranking digits.</div></div></div>';
  }

  function liveStream(state) {
    const st = activeStats(state), m = market(state);
    const sim = state.feedStatus && state.feedStatus.kind === 'sim';
    const pr = state.predict || { phase: 'idle' };
    const running = pr.phase === 'running';
    const locked = lockedResult(state), held = circleLocked(state);
    const strip = m && st && st.n ? C.tickStrip(m, st, { simulated: sim }) : '<div class="strip"><div class="strip-head"><span>' + (sim ? 'SIMULATED TICK FEED' : 'DERIV TICK FEED') + '</span><span>waiting for ticks…</span></div></div>';
    // while a call is open the circle holds the predicted digit (as in the reference); otherwise it follows the latest tick
    const circleDigit = held ? held.digit : (st && st.lastDigit != null ? st.lastDigit : '–');
    return '<div class="card" id="md-stream"><div class="card-head"><span class="pill status">LIVE DIGIT STREAM</span></div>' + strip
      + '<div class="pred-row"><button type="button" class="btn pred-btn" data-predict="differs"' + (running ? ' disabled' : '') + '>DIFFER</button>'
      + '<div class="live-circle' + (held ? ' locked' : '') + '" id="md-live"><span>' + circleDigit + '</span></div>'
      + '<button type="button" class="btn primary pred-btn" data-predict="matches"' + (running ? ' disabled' : '') + '>MATCH</button></div>'
      + '<div class="range-row"><span class="kpi-l">Prediction range</span>' + [1, 2, 3, 4, 5].map(n => '<button type="button" class="range-chip' + (Number(state.settings.horizonTicks) === n ? ' on' : '') + '" data-range="' + n + '">' + n + '</button>').join('') + '</div>'
      + (locked ? '<div class="locked-call" id="md-call">' + (locked.contract === 'differs' ? 'DIFFER ' : 'MATCH ') + locked.digit + '</div>'
        : '<div class="muted small" style="text-align:center;margin-top:8px">The circle follows the latest tick. Press Differ or Match to lock a prediction on ' + C.esc(m ? m.name : 'the active market') + '.</div>') + '</div>';
  }

  function prediction(state) {
    const pr = state.predict; const st = activeStats(state);
    if (!pr || pr.phase === 'idle') return '';
    const recent = st && st.last5 ? st.last5 : [];
    let h = '<div class="card pred-card"><div class="card-head" style="justify-content:center"><span class="pill status">' + (pr.kind === 'differs' ? 'DIFFER PREDICTION' : 'MATCH PREDICTION') + '</span></div>'
      + '<div class="digit-row" id="md-tiles">' + recent.map(d => '<span>' + d + '</span>').join('') + '</div>';
    if (pr.phase === 'running') {
      h += '<div class="scan-title small" style="margin-top:10px;text-align:center">Analyzing ' + (pr.kind === 'differs' ? 'differ' : 'match') + ' pattern</div><ul class="scan-phases" id="md-steps">' + pr.steps.map(p => '<li class="' + p.state + '">' + C.esc(p.label) + '</li>').join('') + '</ul>'
        + '<div class="progress"><div id="md-bar" style="width:' + ((pr.progress || 0) * 100).toFixed(1) + '%"></div></div><div class="scan-pct" id="md-pct">' + Math.round((pr.progress || 0) * 100) + '%</div>';
    } else if (pr.result) {
      const s = pr.result;
      const open = s.outcome == null && s.status === 'live';
      h += '<div class="pred-result"><div class="digit-big">' + s.digit + '</div><div><div class="market-name">' + (s.contract === 'differs' ? 'DIFFER ' : 'MATCH ') + s.digit + '</div><div class="market-sym">' + C.esc(s.symbol) + ' · ' + C.esc(s.mode) + ' mode · horizon ' + s.horizonTicks + ' tick' + (s.horizonTicks > 1 ? 's' : '') + '</div>'
        + '<div class="headline" style="margin-top:6px"><div><span class="str-l">Signal strength</span><span class="str-v">' + s.strength.toFixed(1) + '</span></div><div class="prob">appearance rate <b>' + C.pct(s.probEst) + '</b> vs ' + (s.contract === 'differs' ? '90%' : '10%') + ' base</div></div></div></div>'
        + C.bandBar(s.strength) + '<div class="reason" style="margin-top:8px">' + C.esc(s.reason) + '</div>'
        + '<div class="row" style="margin-top:6px">' + (s.outcome ? C.pill(s.outcome.toUpperCase() + ' · outcome digit ' + s.resolvedDigit, s.outcome === 'win' ? 'ok' : 'bad') : C.pill(open ? 'PENDING · scored on the next ' + s.horizonTicks + ' tick' + (s.horizonTicks > 1 ? 's' : '') : 'PENDING', 'warn')) + '<span class="muted small">recorded in Accuracy as a manual ' + (s.contract === 'differs' ? 'Differs' : 'Matches') + ' call</span></div>';
    }
    return h + '</div>';
  }

  function render(state) {
    if (!el) return;
    el.innerHTML = C.pageTitle('✦', 'Matches / Differs', 'Find the most frequent digit in recent ticks and read how likely the next tick is to repeat it')
      + '<div class="card"><div class="field"><label for="md-market">Select volatility market</label><select id="md-market">' + marketOptions(state) + '</select></div>' + chart(state) + '</div>'
      + settingsCard(state) + (state.predict && state.predict.phase === 'running' ? prediction(state) : liveStream(state) + prediction(state));
    el.querySelector('#md-market').addEventListener('change', (e) => act.setActive(e.target.value));
    el.querySelectorAll('[data-predict]').forEach(b => b.addEventListener('click', () => act.predict(b.getAttribute('data-predict'))));
    el.querySelectorAll('[data-range]').forEach(b => b.addEventListener('click', () => act.setSettings({ horizonTicks: Number(b.getAttribute('data-range')) })));
    el.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => {
      const mode = b.getAttribute('data-mode');
      act.setSettings(mode === 'standard' ? { mode, proBot: false } : { mode }); // leaving PRO also switches the bot off
    }));
    const act1 = el.querySelector('[data-activate]');
    if (act1) act1.addEventListener('click', () => { act1.disabled = true; act1.innerHTML = '<span class="spin-ic" aria-hidden="true">◌</span> ACTIVATING…'; root.setTimeout(() => act.setSettings({ mode: 'pro', proBot: true }), 900); });
    el.querySelector('#md-dur').addEventListener('change', (e) => act.setSettings({ scanAnimMs: Number(e.target.value) }));
    el.querySelector('#md-sample').addEventListener('change', (e) => act.setSettings({ window: Number(e.target.value) }));
    el.querySelector('#md-market2').addEventListener('change', (e) => act.setActive(e.target.value));
  }

  // per-tick partial update: tick strip, digit chart and (while no prediction is locked) the live circle — the forms are untouched
  function renderLive(state) {
    if (!el) return;
    const st = activeStats(state), m = market(state);
    if (!st || !m) return;
    const locked = lockedResult(state), held = circleLocked(state);
    const c = el.querySelector('#md-live span');
    if (c) { const v = held ? String(held.digit) : (st.lastDigit == null ? '–' : String(st.lastDigit)); if (c.textContent !== v) c.textContent = v; const wrap = c.parentNode; if (wrap && wrap.classList) wrap.classList.toggle('locked', !!held); }
    const tiles = el.querySelector('#md-tiles'); if (tiles && st.last5) { const html = st.last5.map(d => '<span>' + d + '</span>').join(''); if (tiles.innerHTML !== html) tiles.innerHTML = html; }
    const u = el.querySelector('#md-updated'); if (u && st.lastEpoch) { const ago = Math.max(0, Math.round(Date.now() / 1000 - st.lastEpoch)); u.textContent = ago <= 1 ? 'updated just now' : 'updated ' + ago + 's ago'; }
    const cir = el.querySelector('.circles'); if (cir) cir.outerHTML = C.digitCircles(st, { lastDigit: st.lastDigit });
    const bars = el.querySelector('.bars'); if (bars) bars.outerHTML = C.digitBars(st, { highlight: st.hot });
    const strip = el.querySelector('.strip'); if (strip && st.n) strip.outerHTML = C.tickStrip(m, st, { simulated: state.feedStatus && state.feedStatus.kind === 'sim' });
    // the call resolves on a later tick: rebuild once so the WIN / LOSS pill appears and the circle goes live again
    if (locked && locked.outcome && !el.querySelector('.pred-card .pill.ok, .pred-card .pill.bad')) render(state);
  }
  function renderProgress(state) {
    if (!el || !state.predict || state.predict.phase !== 'running' || !el.querySelector('#md-bar')) { render(state); return; }
    const pr = state.predict;
    el.querySelector('#md-bar').style.width = ((pr.progress || 0) * 100).toFixed(1) + '%';
    const pct = el.querySelector('#md-pct'); if (pct) pct.textContent = Math.round((pr.progress || 0) * 100) + '%';
    const lis = el.querySelectorAll('#md-steps li'); pr.steps.forEach((p, i) => { if (lis[i] && lis[i].className !== p.state) lis[i].className = p.state; });
  }

  root.MS.ui.matches = { mount(rootEl, actions) { el = rootEl; act = actions; }, render, renderLive, renderProgress };
})(typeof globalThis !== 'undefined' ? globalThis : this);

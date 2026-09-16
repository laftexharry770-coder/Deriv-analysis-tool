// matches-sniper/js/ui/dashboard.js — system status, live tick strip, digit frequency, all-markets grid
(function (root) {
  'use strict';
  const C = root.MS.ui.components;
  let el = null, act = null;

  function statusRows(state) {
    const fs = state.feedStatus || { state: 'offline' };
    const sysTxt = fs.state === 'online' ? 'ONLINE' : fs.state === 'offline' ? 'OFFLINE' : fs.state.toUpperCase();
    const sysKind = fs.state === 'online' ? 'status' : fs.state === 'offline' ? 'bad' : 'warn';
    const am = state.active ? state.book.get(state.active) : null;
    const feedTxt = fs.kind === 'sim' ? 'SIMULATED' : (fs.state !== 'online' ? fs.state.toUpperCase() : (am && am.stale ? 'STALE' : (am && am.ticks.length ? 'CONNECTED' : 'WAITING')));
    const feedKind = feedTxt === 'CONNECTED' ? 'status' : feedTxt === 'SIMULATED' ? 'sim' : feedTxt === 'STALE' ? 'bad' : 'warn';
    return '<div class="card"><div class="status-row"><span class="k">System</span>' + C.pill(sysTxt, sysKind) + '</div>'
      + '<div class="status-row"><span class="k">Tick feed</span>' + C.pill(feedTxt, feedKind) + '</div>'
      + '<div class="status-row"><span class="k">Market</span><span class="mono">' + C.esc(am ? am.name : '—') + '</span></div></div>';
  }

  function strip(state) {
    const m = state.active ? state.book.get(state.active) : null;
    const st = state.activeStats;
    const sim = state.feedStatus && state.feedStatus.kind === 'sim';
    if (!m || !st || !st.n) return '<div class="card"><div class="strip"><div class="strip-head"><span>' + (sim ? 'SIMULATED TICK FEED' : 'DERIV TICK FEED') + '</span><span>waiting for ticks…</span></div></div></div>';
    return '<div class="card">' + C.tickStrip(m, st, { simulated: sim }) + '</div>';
  }

  function freqCard(state) {
    const m = state.active ? state.book.get(state.active) : null;
    const st = state.activeStats;
    if (!m || !st) return '';
    return '<div class="card"><div class="card-head"><div><h3>Digit frequency — ' + C.esc(m.name) + '</h3><div class="sub">' + st.n + ' ticks in sample · window ' + state.settings.window + '</div></div>'
      + '<button type="button" class="btn ghost" data-act="freq">Full graph</button></div>' + C.digitBars(st, { highlight: st.hot }) + '</div>';
  }

  function modules(state) {
    const mods = [['scanner', '◎', 'Volatility Scanner', 'Scan every index, rank by deviation, auto-select the best'], ['matches', '⇄', 'Matches / Differs', 'Most frequent digit and how likely it repeats'], ['signal', '◈', 'Matches Signal', 'Recommended MATCH entry with validity countdown'], ['frequency', '▥', 'Frequency Graph', 'Full digit distribution, live percentages'], ['accuracy', '◔', 'Accuracy', 'Real win-rate of every call the tool made']];
    return '<div class="card"><div class="card-head"><h3>Analysis modules</h3></div><div class="mods">' + mods.map(([id, ic, t, d]) => '<button type="button" class="mod" data-page="' + id + '"><span class="mod-ic">' + ic + '</span><span><b>' + t + '</b><small>' + d + '</small><em>OPEN →</em></span></button>').join('') + '</div></div>';
  }

  function grid(state) {
    const rows = (state.overview || []).map(o => {
      const st = o.stats;
      const status = !o.available ? '<span class="bad-t">unavailable</span>' : o.stale ? '<span class="warn-t">stale</span>' : st.n < state.settings.minSample ? '<span class="warn-t">filling ' + st.n + '/' + state.settings.window + '</span>' : '<span class="ok-t">ready</span>';
      return [C.esc(o.symbol), C.esc(o.name), '<span class="num">' + (st.lastDigit == null ? '–' : st.lastDigit) + '</span>',
        st.hot == null ? '–' : '<span class="num ' + (st.cls[st.hot] === 'above' ? 'acc-t' : '') + '">' + st.hot + ' <span class="muted">' + C.pct(st.freq[st.hot]) + '</span></span>',
        '<span class="num">' + st.deviationScore.toFixed(0) + '</span>', '<span class="num">' + st.tps.toFixed(2) + '</span>',
        '<span class="num">' + (o.lagEma == null ? '–' : Math.round(o.lagEma * 1000) + ' ms') + '</span>', status];
    });
    return '<div class="card"><div class="card-head"><h3>All volatility markets</h3><div class="sub">tap a row to make it active</div></div>'
      + C.table(['Symbol', 'Market', 'Last', 'Hot digit', 'Dev', 't/s', 'Lag', 'Status'], rows, { empty: 'No markets yet — waiting for the feed', rowAttrs: (i) => 'data-symbol="' + C.esc(state.overview[i].symbol) + '"' + (state.overview[i].symbol === state.active ? ' class="active"' : '') }) + '</div>';
  }

  function render(state) {
    if (!el) return;
    el.innerHTML = C.pageTitle('▦', 'Dashboard', 'Live market data and analysis modules') + '<div class="grid-2">' + statusRows(state) + strip(state) + '</div>' + freqCard(state) + modules(state) + grid(state);
    el.querySelectorAll('tr[data-symbol]').forEach(tr => tr.addEventListener('click', () => act.setActive(tr.getAttribute('data-symbol'))));
    const fb = el.querySelector('[data-act="freq"]'); if (fb) fb.addEventListener('click', () => act.navigate('frequency'));
    el.querySelectorAll('.mod[data-page]').forEach(b => b.addEventListener('click', () => act.navigate(b.getAttribute('data-page'))));
  }

  root.MS.ui.dashboard = { mount(rootEl, actions) { el = rootEl; act = actions; }, render };
})(typeof globalThis !== 'undefined' ? globalThis : this);

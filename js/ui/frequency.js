// matches-sniper/js/ui/frequency.js — digit frequency graph with market/window selectors and hot/cold chips
(function (root) {
  'use strict';
  const C = root.MS.ui.components;
  let el = null, act = null;

  function render(state) {
    if (!el) return;
    const f = state.freq || { mode: 'full' };
    const m = state.active ? state.book.get(state.active) : null;
    const st = state.activeStats;
    const markets = state.book.all();
    const sel = '<div class="selects"><select data-set="symbol" aria-label="Market">' + markets.map(x => '<option value="' + C.esc(x.symbol) + '"' + (x.symbol === state.active ? ' selected' : '') + '>' + C.esc(x.name) + '</option>').join('') + '</select>'
      + '<select data-set="window" aria-label="Window">' + [100, 200, 300, 500].map(w => '<option value="' + w + '"' + (Number(state.settings.window) === w ? ' selected' : '') + '>' + w + ' ticks</option>').join('') + '</select>'
      + '<div class="segmented"><button type="button" data-mode="full" class="' + (f.mode !== 'recent' ? 'on' : '') + '">Full</button><button type="button" data-mode="recent" class="' + (f.mode === 'recent' ? 'on' : '') + '">Recent ' + state.settings.recent + '</button></div></div>';
    let body = '';
    if (m && st && st.n) {
      const recent = f.mode === 'recent';
      const freq = recent ? st.freqR : st.freq, counts = recent ? st.countsR : st.counts, n = recent ? st.nR : st.n;
      let hot = 0, cold = 0; for (let d = 1; d < 10; d++) { if (freq[d] > freq[hot]) hot = d; if (freq[d] < freq[cold]) cold = d; }
      const even = [0, 2, 4, 6, 8].reduce((a, d) => a + counts[d], 0) / (n || 1);
      body = '<div class="row between" style="margin:12px 0 8px"><div class="chips"><span class="chip hot">HOT ' + hot + ' · ' + C.pct(freq[hot]) + ' (' + counts[hot] + '×)</span><span class="chip cold">COLD ' + cold + ' · ' + C.pct(freq[cold]) + ' (' + counts[cold] + '×)</span><span class="chip">EVEN ' + C.pct(even) + '</span><span class="chip">ODD ' + C.pct(1 - even) + '</span></div><span class="muted small">' + n + ' ticks in sample</span></div>'
        + C.digitBars(st, { highlight: st.hot, mode: f.mode })
        + '<div class="legend"><span><i style="background:var(--bar-above)"></i>Above baseline (z ≥ 1)</span><span><i style="background:var(--bar-normal)"></i>Normal</span><span><i style="background:var(--bar-below)"></i>Below baseline (z ≤ −1)</span><span><i style="border-top:1px dashed var(--amber);height:0;width:12px"></i>10% uniform baseline</span></div>'
        + '<div class="meta-line" style="margin-top:8px">Top run: current run ' + st.currentRun + '× digit ' + st.lastDigit + ' · hot digit ' + st.hot + ' z ' + st.zBlend[st.hot].toFixed(2) + ' · market deviation ' + st.deviationScore.toFixed(0) + '/100 (χ² ' + st.chi2.toFixed(2) + ')</div>'
        + '<div style="margin-top:14px"><h3 style="margin-bottom:8px">Appearance rate per digit</h3>' + C.digitCircles(st, { lastDigit: st.lastDigit }) + '<div class="legend"><span><i style="background:var(--accent)"></i>Highest</span><span><i style="background:var(--border-2)"></i>Lowest</span><span><i style="background:var(--amber)"></i>Last tick</span></div></div>';
    } else body = '<div class="muted" style="margin-top:12px">Waiting for ticks on this market…</div>';
    el.innerHTML = C.pageTitle('▥', 'Frequency graph', 'Appearance rate per digit against the 10% baseline') + '<div class="card"><div class="card-head"><div><h3>' + C.esc(m ? m.name : 'No market') + '</h3><div class="sub">appearance rate over the selected window</div></div></div>' + sel + body + '</div>';
    el.querySelector('[data-set="symbol"]').addEventListener('change', (e) => act.setActive(e.target.value));
    el.querySelector('[data-set="window"]').addEventListener('change', (e) => act.setSettings({ window: Number(e.target.value) }));
    el.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => act.setFreq({ mode: b.getAttribute('data-mode') })));
  }

  // per-tick partial update: bars, circles and the meta line; the selectors are left alone
  function renderLive(state) {
    if (!el) return;
    const st = state.activeStats, f = state.freq || { mode: 'full' };
    const bars = el.querySelector('.bars'), cir = el.querySelector('.circles');
    if (!st || !st.n || !bars || !cir) { render(state); return; }
    bars.outerHTML = C.digitBars(st, { highlight: st.hot, mode: f.mode });
    cir.outerHTML = C.digitCircles(st, { lastDigit: st.lastDigit });
    const meta = el.querySelector('.meta-line'); if (meta) meta.textContent = 'Top run: current run ' + st.currentRun + '× digit ' + st.lastDigit + ' · hot digit ' + st.hot + ' z ' + st.zBlend[st.hot].toFixed(2) + ' · market deviation ' + st.deviationScore.toFixed(0) + '/100 (χ² ' + st.chi2.toFixed(2) + ')';
  }

  root.MS.ui.frequency = { mount(rootEl, actions) { el = rootEl; act = actions; }, render, renderLive };
})(typeof globalThis !== 'undefined' ? globalThis : this);

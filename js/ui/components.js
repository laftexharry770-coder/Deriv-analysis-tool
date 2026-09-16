// matches-sniper/js/ui/components.js — pure HTML string builders (no DOM access; testable in Node)
(function (root, factory) {
  const mod = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  root.MS = root.MS || {}; root.MS.ui = root.MS.ui || {}; root.MS.ui.components = mod;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pct = (x, d) => (100 * (x || 0)).toFixed(d == null ? 1 : d) + '%';
  const num = (x, d) => (x == null || Number.isNaN(x)) ? '–' : Number(x).toFixed(d == null ? 2 : d);

  function pill(text, kind) { return '<span class="pill ' + esc(kind || 'info') + '">' + esc(text) + '</span>'; }

  // 10-column digit frequency chart. mode 'full' uses counts/freq, 'recent' uses countsR/freqR.
  function digitBars(st, opts) {
    opts = opts || {};
    const recent = opts.mode === 'recent';
    const counts = recent ? st.countsR : st.counts, freq = recent ? st.freqR : st.freq, n = recent ? st.nR : st.n;
    const max = Math.max(0.15, ...(freq || [0]));
    let h = '<div class="bars" role="img" aria-label="Digit frequency over the last ' + (n || 0) + ' ticks">';
    // the bar track is the chart height minus the label rows (see .bars .col grid rows in app.css)
    h += '<div class="baseline" style="bottom:calc(30px + ' + (0.1 / max).toFixed(4) + ' * (100% - 48px))" title="10% uniform baseline"></div>';
    for (let d = 0; d < 10; d++) {
      const cls = ['bar', st.cls ? st.cls[d] : 'normal']; if (opts.highlight === d) cls.push('hi'); if (st.lastDigit === d) cls.push('last');
      const f = freq ? freq[d] : 0;
      const hgt = max ? (f / max * 100) : 0;
      h += '<div class="col"><div class="cnt">' + (counts ? counts[d] : 0) + '×</div>'
        + '<div class="track"><div class="' + cls.join(' ') + '" style="height:' + hgt.toFixed(1) + '%"></div></div>'
        + '<div class="dg">' + d + '</div><div class="pc">' + pct(f) + '</div></div>';
    }
    return h + '</div>';
  }

  function digitCircles(st, opts) {
    opts = opts || {};
    let h = '<div class="circles">';
    for (let d = 0; d < 10; d++) {
      const cls = ['circle']; if (st.hot === d) cls.push('hot'); if (st.cold === d) cls.push('cold'); if (opts.lastDigit === d) cls.push('last');
      h += '<div class="' + cls.join(' ') + '">' + (opts.lastDigit === d ? '<span class="arrow" aria-label="latest tick">↑</span>' : '') + '<div class="cd">' + d + '</div><div class="cp">' + pct(st.freq ? st.freq[d] : 0) + '</div></div>';
    }
    return h + '</div>';
  }

  function bandBar(strength) {
    const s = Math.max(0, Math.min(100, Number(strength) || 0));
    const segs = [['LOW', 0, 60], ['MID', 60, 80], ['HIGH', 80, 95], ['ELITE', 95, 100]];
    let h = '<div class="band" role="img" aria-label="Signal strength ' + s.toFixed(0) + ' of 100">';
    for (const [name, a, b] of segs) h += '<div class="seg ' + name.toLowerCase() + (s >= a && (s < b || b === 100) ? ' on' : '') + '" style="flex:' + (b - a) + '"><span>' + name + '</span></div>';
    return h + '<div class="marker" style="left:' + s.toFixed(1) + '%"></div></div>';
  }

  function countdownRing(remainingSec, totalSec) {
    const r = 44, c = 2 * Math.PI * r;
    const frac = totalSec > 0 ? Math.max(0, Math.min(1, remainingSec / totalSec)) : 0;
    const cls = frac > 0.5 ? 'ok' : (frac > 0.2 ? 'warn' : 'bad');
    return '<div class="ring ' + cls + '"><svg viewBox="0 0 100 100" aria-hidden="true"><circle class="bg" cx="50" cy="50" r="' + r + '"/>'
      + '<circle class="fg" cx="50" cy="50" r="' + r + '" stroke-dasharray="' + c.toFixed(2) + '" stroke-dashoffset="' + (c * (1 - frac)).toFixed(2) + '"/></svg>'
      + '<div class="ring-text"><span class="ring-val">' + Math.max(0, remainingSec).toFixed(1) + 's</span><span class="ring-lbl">valid</span></div></div>';
  }

  function table(headers, rows, opts) {
    opts = opts || {};
    let h = '<div class="table-wrap"><table class="' + esc(opts.cls || '') + '"><thead><tr>' + headers.map(x => '<th>' + esc(x) + '</th>').join('') + '</tr></thead><tbody>';
    if (!rows.length) h += '<tr><td class="empty" colspan="' + headers.length + '">' + esc(opts.empty || 'No rows yet') + '</td></tr>';
    rows.forEach((r, i) => { h += '<tr' + (opts.rowAttrs ? ' ' + opts.rowAttrs(i, r) : '') + '>' + r.map(c => '<td>' + c + '</td>').join('') + '</tr>'; });
    return h + '</tbody></table></div>';
  }

  function kpi(label, value, sub, kind) {
    return '<div class="kpi' + (kind ? ' ' + esc(kind) : '') + '"><div class="kpi-l">' + esc(label) + '</div><div class="kpi-v">' + value + '</div>' + (sub ? '<div class="kpi-s">' + sub + '</div>' : '') + '</div>';
  }

  const GATE_LABELS = { sample: 'Sample size', zFull: 'z (full window)', zRecent: 'z (recent window)', recency: 'Digit seen within', feed: 'Feed live', cooldown: 'Cooldown' };
  const GATE_FMT = {
    sample: g => g.value + ' / ' + g.need + ' ticks',
    zFull: g => num(g.value) + ' ≥ ' + num(g.need, 1),
    zRecent: g => num(g.value) + ' ≥ ' + num(g.need, 1),
    recency: g => (g.value == null ? '–' : g.value + ' ticks') + ' ≤ ' + g.need,
    feed: g => g.pass ? 'live ticks' : (g.value || 'stale'),
    cooldown: g => (g.value > 86400 ? 'no prior signal' : g.value + ' s') + ' ≥ ' + g.need + ' s'
  };
  function gateList(gates) {
    let h = '<ul class="gates">';
    for (const k of Object.keys(gates)) {
      const g = gates[k];
      h += '<li class="gate ' + (g.pass ? 'pass' : 'fail') + '"><span class="gk">' + esc(GATE_LABELS[k] || k) + '</span><span class="gv">' + esc((GATE_FMT[k] || (x => String(x.value)))(g)) + '</span></li>';
    }
    return h + '</ul>';
  }

  function sparkline(values, opts) {
    opts = opts || {}; const w = opts.w || 320, h = opts.h || 60, pad = 4;
    let body = '';
    if (values.length > 1) {
      const pts = values.map((v, i) => [(pad + i * (w - 2 * pad) / (values.length - 1)).toFixed(1), (h - pad - v * (h - 2 * pad)).toFixed(1)]);
      body = '<polyline class="spark" fill="none" points="' + pts.map(p => p.join(',')).join(' ') + '"/>'
        + '<circle class="spark-end" cx="' + pts[pts.length - 1][0] + '" cy="' + pts[pts.length - 1][1] + '" r="2.5"/>';
    }
    const base = opts.baseline == null ? null : (h - pad - opts.baseline * (h - 2 * pad)).toFixed(1);
    return '<svg class="sparkline" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" aria-hidden="true">'
      + (base ? '<line class="spark-base" x1="0" x2="' + w + '" y1="' + base + '" y2="' + base + '"/>' : '') + body + '</svg>';
  }

  /** Reference-style tick feed strip: quote, a long row of last digits with the latest highlighted, ticks/s. */
  function tickStrip(m, st, opts) {
    opts = opts || {};
    const last = m.ticks[m.ticks.length - 1];
    const digits = m.ticks.slice(-13).map(t => t.digit); // one row: as many of the newest as fit, latest on the right
    const pip = m.pipSize == null ? 2 : m.pipSize;
    return '<div class="strip"><div class="strip-head"><span>' + (opts.simulated ? 'SIMULATED TICK FEED' : 'DERIV TICK FEED') + ' · ' + esc(m.symbol) + '</span><span>' + m.ticks.length + ' ticks · ' + st.tps.toFixed(2) + ' t/s</span></div>'
      + '<div class="strip-body"><div><div class="lbl">Quote</div><div class="quote">' + esc(last.quote.toFixed(pip)) + '</div></div>'
      + '<div class="strip-digits"><div class="lbl">Last digits</div><div class="lastd">' + digits.slice(0, -1).map(d => '<span>' + d + '</span>').join('') + '</div></div>'
      + '<div class="strip-latest"><div class="lbl">Latest</div><div class="latest">' + digits[digits.length - 1] + '</div></div></div></div>';
  }

  /** Page heading in the reference-tool style: a square icon badge beside an uppercase title. */
  function pageTitle(icon, title, sub) { return '<h2><span class="mod-ic" aria-hidden="true">' + icon + '</span><span>' + esc(title) + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</span></h2>'; }

  return { esc, pct, num, pill, digitBars, digitCircles, bandBar, countdownRing, table, kpi, gateList, sparkline, pageTitle, tickStrip };
});

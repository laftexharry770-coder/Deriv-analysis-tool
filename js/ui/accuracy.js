// matches-sniper/js/ui/accuracy.js — real win-rate of issued signals vs the 10% baseline and break-even
(function (root) {
  'use strict';
  const C = root.MS.ui.components;
  let el = null, act = null;
  const rate = (x) => x == null ? '–' : C.pct(x);

  function render(state) {
    if (!el) return;
    const m = state.metrics; const src = state.accuracySource || 'all'; const pm = Number(state.settings.payoutMultiple) || 8.9;
    const seg = '<div class="segmented">' + [['live', 'Live'], ['sim', 'Sim'], ['all', 'All']].map(([k, l]) => '<button type="button" data-src="' + k + '" class="' + (src === k ? 'on' : '') + '">' + l + '</button>').join('') + '</div>';
    let kpis = '', detail = '';
    if (m) {
      const wrKind = m.winRate == null ? '' : (m.ci.lo > m.breakEven ? 'good' : (m.ci.hi < m.breakEven ? 'bad' : 'warn'));
      kpis = '<div class="kpis">'
        + C.kpi('Signals', m.total, m.pending + ' pending')
        + C.kpi('Wins', m.wins, '', 'good') + C.kpi('Losses', m.losses, '', m.losses ? 'bad' : '')
        + C.kpi('Win-rate', rate(m.winRate), m.winRate == null ? 'no resolved signals' : '95% CI ' + C.pct(m.ci.lo, 0) + '–' + C.pct(m.ci.hi, 0), wrKind)
        + C.kpi('Edge vs 10%', m.edge == null ? '–' : (m.edge >= 0 ? '+' : '') + (m.edge * 100).toFixed(1) + ' pts', 'baseline 10.0%', m.edge == null ? '' : (m.edge > 0 ? 'good' : 'bad'))
        + C.kpi('Break-even', C.pct(m.breakEven), 'payout ×' + pm + ' (Settings)')
        + C.kpi('Last 20 / 50', rate(m.rolling20) + ' / ' + rate(m.rolling50), 'rolling win-rate')
        + C.kpi('Streak', (m.streak.current > 0 ? '+' : '') + m.streak.current, 'best +' + m.streak.best + ' · worst ' + m.streak.worst)
        + C.kpi('Hit in window', m.windowTotal ? C.pct(m.windowHits / m.windowTotal) : '–', m.windowHits + ' of ' + m.windowTotal + ' within entry window') + '</div>';
      const tbl = (title, rows, headers) => '<div class="card"><div class="card-head"><h3>' + title + '</h3></div>' + C.table(headers, rows, { empty: 'Nothing resolved yet' }) + '</div>';
      detail = '<div class="card"><div class="card-head"><h3>Cumulative win-rate</h3><div class="sub">dashed line = break-even ' + C.pct(m.breakEven) + '</div></div>' + C.sparkline(m.timeline, { w: 320, h: 70, baseline: m.breakEven }) + '</div>'
        + '<div class="grid-2">'
        + tbl('Per market', m.perMarket.map(g => [C.esc(g.market), '<span class="num">' + g.n + '</span>', '<span class="num">' + g.wins + '</span>', '<span class="num">' + rate(g.winRate) + '</span>']), ['Market', 'Signals', 'Wins', 'Win-rate'])
        + tbl('Per strength band', m.perBand.map(g => [C.esc(g.band), '<span class="num">' + g.n + '</span>', '<span class="num">' + g.wins + '</span>', '<span class="num">' + rate(g.winRate) + '</span>']), ['Band', 'Signals', 'Wins', 'Win-rate'])
        + '</div>' + tbl('Per horizon', m.perHorizon.map(g => ['<span class="num">' + g.horizonTicks + ' tick' + (g.horizonTicks > 1 ? 's' : '') + '</span>', '<span class="num">' + g.n + '</span>', '<span class="num">' + g.wins + '</span>', '<span class="num">' + rate(g.winRate) + '</span>']), ['Horizon', 'Signals', 'Wins', 'Win-rate']);
    }
    el.innerHTML = C.pageTitle('◔', 'Accuracy', 'Real win-rate of every signal issued') + '<div class="card"><div class="card-head"><div><h3>Signal precision</h3><div class="sub">every signal is scored on the real tick that followed it' + (state.storeAvailable ? '' : ' · <span class="warn-t">history is not being saved (storage unavailable)</span>') + '</div></div>' + seg + '</div>' + kpis + '</div>' + detail
      + '<div class="card"><div class="controls"><button type="button" class="btn" data-act="export">Export CSV</button><button type="button" class="btn danger" data-act="clear">Clear history</button></div></div>';
    el.querySelectorAll('[data-src]').forEach(b => b.addEventListener('click', () => act.setAccuracySource(b.getAttribute('data-src'))));
    el.querySelector('[data-act="export"]').addEventListener('click', () => act.exportCsv());
    el.querySelector('[data-act="clear"]').addEventListener('click', () => { if (root.confirm('Clear all recorded signals? This cannot be undone.')) act.clearHistory(); });
  }

  root.MS.ui.accuracy = { mount(rootEl, actions) { el = rootEl; act = actions; }, render };
})(typeof globalThis !== 'undefined' ? globalThis : this);

const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../js/ui/components.js');
const stats = require('../js/stats.js');
const ticks = Array.from({ length: 200 }, (_, i) => ({ epoch: i, quote: 1, digit: (i % 10 === 3 || i % 20 === 4) ? 3 : i % 10 }));
const st = stats.computeStats(ticks, { window: 200, recent: 50 });

test('digitBars renders 10 bars with counts and classes', () => {
  const html = C.digitBars(st, { highlight: 3 });
  assert.equal((html.match(/class="bar /g) || []).length, 10);
  assert.match(html, /30×/); assert.match(html, /15\.0%/); assert.match(html, /bar above/); assert.match(html, /baseline/);
  assert.match(C.digitBars(st, { mode: 'recent' }), /class="bar /);
  assert.match(C.digitBars(stats.computeStats([], {}), {}), /class="bar /);
});
test('digitCircles, bandBar, countdownRing, pill, table, esc, kpi, gateList, sparkline', () => {
  assert.equal((C.digitCircles(st, { lastDigit: 9 }).match(/class="circle[ "]/g) || []).length, 10);
  assert.match(C.digitCircles(st, { lastDigit: 9 }), /circle hot/); assert.match(C.digitCircles(st, { lastDigit: 9 }), /circle[^"]*last/);
  assert.match(C.bandBar(97), /ELITE/); assert.match(C.bandBar(97), /marker/);
  assert.match(C.countdownRing(8.3, 10), /8\.3s/); assert.match(C.countdownRing(8.3, 10), /<svg/);
  assert.equal(C.pill('LIVE', 'ok'), '<span class="pill ok">LIVE</span>');
  assert.match(C.table(['A', 'B'], [['1', '2']]), /<table/); assert.match(C.table(['A'], []), /table-wrap/); assert.match(C.table(['A'], []), /No rows/);
  assert.match(C.table(['A'], [['x']], { rowAttrs: () => 'data-symbol="R_10"' }), /<tr data-symbol="R_10">/);
  assert.equal(C.esc('<b>&"\''), '&lt;b&gt;&amp;&quot;&#39;');
  assert.match(C.kpi('Wins', '3', 'of 10'), /class="kpi"/);
  const g = C.gateList({ sample: { pass: true, value: 200, need: 180 }, edge: { pass: false, value: 0.4, need: 2 } });
  assert.match(g, /gate pass/); assert.match(g, /gate fail/); assert.match(g, /0\.40/);
  assert.match(C.sparkline([0.1, 0.5, 0.33], { w: 100, h: 30 }), /<polyline/); assert.match(C.sparkline([], {}), /<svg/);
});

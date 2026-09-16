// matches-sniper/js/ui/settings.js — connection, analysis, sniper gates, validity, automation, persistence
(function (root) {
  'use strict';
  const C = root.MS.ui.components;
  let el = null, act = null;

  const num = (id, label, v, hint, attrs) => '<div class="field"><label for="' + id + '">' + label + '</label><input type="number" id="' + id + '" name="' + id + '" value="' + C.esc(v) + '" ' + (attrs || '') + '>' + (hint ? '<div class="hint">' + hint + '</div>' : '') + '</div>';
  const chk = (id, label, v, hint) => '<div class="field"><label class="toggle" for="' + id + '"><input type="checkbox" id="' + id + '" name="' + id + '"' + (v ? ' checked' : '') + '> ' + label + '</label>' + (hint ? '<div class="hint">' + hint + '</div>' : '') + '</div>';

  function render(state) {
    if (!el) return;
    const s = state.settings;
    el.innerHTML = C.pageTitle('⚙', 'Analysis settings', 'Connection, windows, sniper gates, automation') + '<form class="form" id="settings-form" autocomplete="off">'
      + '<fieldset><legend>Connection</legend>'
      + '<div class="field-row">' + '<div class="field"><label for="appId">Deriv app_id</label><input type="text" id="appId" name="appId" value="' + C.esc(s.appId) + '"><div class="hint">only used with a legacy token; the live feed itself needs no app id</div></div>'
      + '<div class="field"><label for="token">API token (read scope)</label><input type="password" id="token" name="token" value="' + C.esc(s.token) + '" placeholder="paste your own token"><div class="hint">Optional. The live feed uses the public Deriv market-data socket and needs no token. Leave empty unless you have a legacy (non-pat_) token.</div></div></div>'
      + chk('simulator', 'Use the built-in simulator instead of the live feed', s.simulator, 'Uniform random digits at real Deriv cadence and precision — every screen is labelled SIMULATED and results are tracked separately.')
      + '</fieldset>'
      + '<fieldset><legend>Analysis</legend><div class="field-row">'
      + num('window', 'Window (ticks)', s.window, 'full sample, 100–500', 'min="50" max="1000" step="10"') + num('recent', 'Recent window (ticks)', s.recent, 'newest ticks weighed against the full window', 'min="10" max="200" step="5"') + '</div>'
      + '<div class="field"><label>Analysis mode</label><div class="radios"><label><input type="radio" name="mode" value="standard"' + (s.mode === 'standard' ? ' checked' : '') + '> Standard</label><label><input type="radio" name="mode" value="pro"' + (s.mode === 'pro' ? ' checked' : '') + '> Pro — weights the newest 60% of the sample double</label></div></div>'
      + '</fieldset>'
      + '<fieldset><legend>Sniper gates</legend><div class="field-row">'
      + num('minSample', 'Min sample (ticks)', s.minSample, '', 'min="20" max="1000"') + num('minZFull', 'Min z, full window', s.minZFull, 'default 1.5', 'min="0" max="6" step="0.1"')
      + num('minZRecent', 'Min z, recent window', s.minZRecent, 'default 1.0', 'min="0" max="6" step="0.1"') + num('maxLagSec', 'Max feed lag (s)', s.maxLagSec, 'signals are refused above this', 'min="0.2" max="10" step="0.1"')
      + num('cooldownSec', 'Per-market cooldown (s)', s.cooldownSec, '', 'min="0" max="600"') + num('maxSinceLast', 'Digit seen within (ticks)', s.maxSinceLast, 'recency gate threshold', 'min="1" max="200"') + '</div>'
      + chk('recencyGate', 'Require the hot digit to have appeared recently', s.recencyGate)
      + '</fieldset>'
      + '<fieldset><legend>Validity and scoring</legend><div class="field-row">'
      + num('entryWindowTicks', 'Entry window (ticks)', s.entryWindowTicks, 'valid-for seconds = ticks × measured tick interval', 'min="1" max="60"')
      + '<div class="field"><label for="horizonTicks">Evaluation horizon</label><select id="horizonTicks" name="horizonTicks">' + [1, 3, 5].map(h => '<option value="' + h + '"' + (Number(s.horizonTicks) === h ? ' selected' : '') + '>' + h + ' tick' + (h > 1 ? 's' : '') + '</option>').join('') + '</select><div class="hint">the Matches contract duration you trade</div></div>'
      + num('payoutMultiple', 'Payout multiple', s.payoutMultiple, 'used only for the break-even line', 'min="1" max="20" step="0.1"') + '</div></fieldset>'
      + '<fieldset><legend>Automation</legend><div class="field-row">'
      + num('scanAnimMs', 'Scan animation (ms)', s.scanAnimMs, '0 = instant', 'min="0" max="10000" step="100"') + '</div>'
      + chk('sound', 'Play a sound when a signal fires', s.sound)
      + '</fieldset>'
      + '<div class="controls"><button type="submit" class="btn primary">Save &amp; reconnect</button><button type="button" class="btn ghost" data-act="reset">Reset to defaults</button>'
      + (state.storeAvailable ? '<span class="muted small">settings are saved in this browser</span>' : '<span class="warn-t small">storage unavailable — settings last for this session only</span>') + '</div></form>';
    const form = el.querySelector('#settings-form');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const patch = {};
      for (const inp of form.querySelectorAll('input, select')) {
        if (inp.type === 'radio') { if (inp.checked) patch[inp.name] = inp.value; continue; }
        if (inp.type === 'checkbox') { patch[inp.name] = inp.checked; continue; }
        if (inp.type === 'number' || inp.tagName === 'SELECT') { patch[inp.name] = Number(inp.value); continue; }
        patch[inp.name] = inp.value.trim();
      }
      act.setSettings(patch, { reconnect: true });
    });
    el.querySelector('[data-act="reset"]').addEventListener('click', () => { if (root.confirm('Reset every setting to its default? Your API token will be cleared.')) act.resetSettings(); });
  }

  root.MS.ui.settings = { mount(rootEl, actions) { el = rootEl; act = actions; }, render };
})(typeof globalThis !== 'undefined' ? globalThis : this);

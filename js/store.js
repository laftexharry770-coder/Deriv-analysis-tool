// matches-sniper/js/store.js
(function (root, factory) {
  const mod = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  root.MS = root.MS || {}; root.MS.store = mod;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  const isNode = typeof require === 'function' && typeof module !== 'undefined';
  const signals = isNode ? require('./signals.js') : root.MS.signals;
  const K_SET = 'ms.settings.v1', K_SIG = 'ms.signals.v1', CAP = 2000;

  function createStore(storage) {
    if (storage === undefined) { try { storage = root.localStorage; } catch (e) { storage = null; } }
    const mem = { settings: null, signals: [] };
    let available = !!storage;
    if (storage) { try { storage.getItem('__ms_probe__'); } catch (e) { available = false; } }
    const read = (k) => { if (!storage) return null; try { return storage.getItem(k); } catch (e) { available = false; return null; } };
    const write = (k, v) => { if (!storage) return; try { storage.setItem(k, v); } catch (e) { available = false; } };
    const api = {
      get available() { return available; },
      loadSettings() {
        let saved = null; const raw = read(K_SET);
        if (raw) { try { saved = JSON.parse(raw); } catch (e) { saved = null; } }
        if (!saved || typeof saved !== 'object') saved = mem.settings;
        return Object.assign({}, signals.DEFAULT_SETTINGS, saved || {});
      },
      saveSettings(s) { const merged = Object.assign({}, api.loadSettings(), s); mem.settings = merged; write(K_SET, JSON.stringify(merged)); return merged; },
      loadSignals() {
        const raw = read(K_SIG);
        if (raw) { try { const a = JSON.parse(raw); if (Array.isArray(a)) return a; } catch (e) { /* corrupt: fall through to memory */ } }
        return mem.signals.slice();
      },
      saveSignals(list) { const capped = list.length > CAP ? list.slice(list.length - CAP) : list.slice(); mem.signals = capped; write(K_SIG, JSON.stringify(capped)); },
      clearSignals() { mem.signals = []; if (storage) { try { storage.removeItem(K_SIG); } catch (e) { /* ignore */ } } }
    };
    return api;
  }
  return { createStore, K_SET, K_SIG, CAP };
});

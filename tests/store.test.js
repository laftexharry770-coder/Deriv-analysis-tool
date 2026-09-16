const test = require('node:test');
const assert = require('node:assert/strict');
const { createStore } = require('../js/store.js');
const { DEFAULT_SETTINGS } = require('../js/signals.js');

function fakeStorage() { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; }

test('settings round trip merges defaults', () => {
  const st = createStore(fakeStorage());
  assert.equal(st.available, true);
  assert.deepEqual(st.loadSettings(), DEFAULT_SETTINGS);
  st.saveSettings({ window: 300, token: 'abc' });
  const s = st.loadSettings();
  assert.equal(s.window, 300); assert.equal(s.token, 'abc'); assert.equal(s.recent, DEFAULT_SETTINGS.recent);
});

test('signals round trip, cap 2000, clear', () => {
  const st = createStore(fakeStorage());
  assert.deepEqual(st.loadSignals(), []);
  const many = Array.from({ length: 2100 }, (_, i) => ({ id: 'x' + i, issuedAt: i }));
  st.saveSignals(many);
  const back = st.loadSignals();
  assert.equal(back.length, 2000); assert.equal(back[0].id, 'x100'); assert.equal(back[1999].id, 'x2099');
  st.clearSignals(); assert.deepEqual(st.loadSignals(), []);
});

test('missing or throwing storage degrades to memory', () => {
  const st = createStore(null);
  assert.equal(st.available, false);
  st.saveSettings({ window: 100 }); assert.equal(st.loadSettings().window, 100);
  const bad = createStore({ getItem() { throw new Error('quota'); }, setItem() { throw new Error('quota'); }, removeItem() {} });
  assert.equal(bad.available, false);
  bad.saveSignals([{ id: 'a' }]); assert.deepEqual(bad.loadSignals(), [{ id: 'a' }]);
});

test('corrupt JSON is ignored', () => {
  const s = fakeStorage(); s.setItem('ms.settings.v1', '{nope'); s.setItem('ms.signals.v1', '[1,');
  const st = createStore(s);
  assert.deepEqual(st.loadSettings(), DEFAULT_SETTINGS);
  assert.deepEqual(st.loadSignals(), []);
});

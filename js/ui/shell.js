// matches-sniper/js/ui/shell.js — top bar, drawer nav, status pills, banner, toast (DOM)
(function (root, factory) {
  const mod = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  root.MS = root.MS || {}; root.MS.ui = root.MS.ui || {}; root.MS.ui.shell = mod;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  const C = root.MS && root.MS.ui && root.MS.ui.components;
  const PAGES = ['dashboard', 'scanner', 'matches', 'signal', 'frequency', 'accuracy', 'settings', 'account', 'upgrade', 'support', 'admin'];
  let doc = null, onNavigate = null, toastTimer = null, bannerHandler = null;

  function $(id) { return doc.getElementById(id); }

  function mount(document, opts) {
    doc = document; onNavigate = (opts && opts.onNavigate) || function () {};
    const toggle = $('nav-toggle'), drawer = $('drawer'), scrim = $('scrim');
    const open = (on) => { drawer.classList.toggle('open', on); scrim.hidden = !on; toggle.setAttribute('aria-expanded', on ? 'true' : 'false'); };
    toggle.addEventListener('click', () => open(!drawer.classList.contains('open')));
    scrim.addEventListener('click', () => open(false));
    drawer.addEventListener('click', (e) => {
      const a = e.target.closest('[data-page]'); if (!a) return;
      e.preventDefault(); open(false); onNavigate(a.getAttribute('data-page'));
    });
    $('banner').addEventListener('click', (e) => {
      const b = e.target.closest('[data-action]'); if (!b || !bannerHandler) return;
      bannerHandler(b.getAttribute('data-action'));
    });
    doc.addEventListener('keydown', (e) => { if (e.key === 'Escape') open(false); });
    initTheme();
  }

  // ---- light / dark: explicit choice is stored; otherwise the system preference applies
  function effectiveTheme() {
    const t = doc.documentElement.getAttribute('data-theme');
    if (t) return t;
    return (root.matchMedia && root.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  }
  function applyTheme(t) {
    if (t) doc.documentElement.setAttribute('data-theme', t); else doc.documentElement.removeAttribute('data-theme');
    const b = $('theme-toggle'); if (b) b.querySelector('span').textContent = effectiveTheme() === 'dark' ? '☀' : '☾';
  }
  function initTheme() {
    let saved = null; try { saved = root.localStorage.getItem('ms.theme'); } catch (e) { /* storage may be blocked */ }
    applyTheme(saved === 'light' || saved === 'dark' ? saved : null);
    const b = $('theme-toggle');
    if (b) b.addEventListener('click', () => { const next = effectiveTheme() === 'dark' ? 'light' : 'dark'; applyTheme(next); try { root.localStorage.setItem('ms.theme', next); } catch (e) { /* ignore */ } });
    if (root.matchMedia) root.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme(doc.documentElement.getAttribute('data-theme')));
  }

  function setPage(id) {
    for (const p of PAGES) { const el = $('page-' + p); if (el) el.hidden = p !== id; }
    doc.querySelectorAll('#drawer [data-page]').forEach(a => a.classList.toggle('active', a.getAttribute('data-page') === id));
    root.scrollTo && root.scrollTo(0, 0);
  }

  // pills: { system: 'ONLINE'|'OFFLINE'|'CONNECTING'|'AUTHORIZING', feed: 'LIVE'|'STALE'|'SIMULATED'|'WAITING', lagMs: number|null }
  function setPills(p) {
    const sysKind = p.system === 'ONLINE' ? 'status' : (p.system === 'OFFLINE' ? 'bad' : 'warn');
    const feedKind = p.feed === 'LIVE' ? 'status' : (p.feed === 'SIMULATED' ? 'sim' : (p.feed === 'STALE' ? 'bad' : 'warn'));
    $('pills').innerHTML = C.pill(p.system, sysKind) + C.pill('FEED ' + p.feed, feedKind) + (p.lagMs == null ? '' : C.pill('LAG ' + Math.round(p.lagMs) + ' ms', (p.lagMs > 1500 ? 'bad' : 'info') + ' lag'));
  }

  function showBanner(b, handler) {
    bannerHandler = handler || null;
    const el = $('banner');
    el.innerHTML = '<div class="banner-title">' + C.esc(b.title) + '</div><div class="banner-body">' + C.esc(b.body) + '</div>'
      + (b.actions && b.actions.length ? '<div class="banner-actions">' + b.actions.map(a => '<button type="button" class="btn ' + (a.primary ? 'primary' : 'ghost') + '" data-action="' + C.esc(a.id) + '">' + C.esc(a.label) + '</button>').join('') + '</div>' : '');
    el.hidden = false;
  }
  function hideBanner() { const el = $('banner'); el.hidden = true; el.innerHTML = ''; bannerHandler = null; }

  function toast(msg, kind) {
    const el = $('toast'); el.className = 'toast ' + (kind || 'info'); el.textContent = msg; el.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 3500);
  }

  return { mount, setPage, setPills, showBanner, hideBanner, toast, applyTheme, effectiveTheme, PAGES };
});

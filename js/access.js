// matches-sniper/js/access.js — entitlement rules (pure): who may open which page, how the account badge reads
(function (root, factory) {
  const mod = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  root.MS = root.MS || {}; root.MS.access = mod;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function isPremium(profile, nowMs) {
    if (!profile || !profile.premium_until) return false;
    const t = new Date(profile.premium_until).getTime();
    return Number.isFinite(t) && t > (nowMs == null ? Date.now() : nowMs);
  }
  function daysLeft(profile, nowMs) {
    if (!isPremium(profile, nowMs)) return 0;
    return Math.ceil((new Date(profile.premium_until).getTime() - (nowMs == null ? Date.now() : nowMs)) / 86400000);
  }
  function isAdmin(profile, cfg) {
    if (!profile) return false;
    const admins = (cfg && cfg.adminEmails) || [];
    return admins.map((e) => String(e).toLowerCase()).includes(String(profile.email || '').toLowerCase());
  }
  /** Admins have every feature regardless of payment. */
  function hasFullAccess(profile, cfg, nowMs) { return isAdmin(profile, cfg) || isPremium(profile, nowMs); }
  /** 'ok' | 'login' | 'premium' | 'admin' */
  function pageAccess(page, profile, cfg, nowMs) {
    if (!profile) return 'login';
    if (isAdmin(profile, cfg)) return 'ok';
    if (page === 'admin') return 'admin';
    const free = (cfg && cfg.freePages) || [];
    if (free.includes(page)) return 'ok';
    return isPremium(profile, nowMs) ? 'ok' : 'premium';
  }
  /** Text + flags for the account chip: { id, tier: 'PREMIUM'|'FREE', tick: boolean } */
  function accountBadge(profile, nowMs) {
    if (!profile) return null;
    const premium = isPremium(profile, nowMs);
    const admin = !!profile.is_admin; // set by the server from the owner email, never from a stored flag
    return { id: profile.account_id || '—', tier: admin ? 'ADMIN' : (premium ? 'PREMIUM' : 'FREE'), tick: (!!profile.verified && premium) || admin, daysLeft: daysLeft(profile, nowMs) };
  }

  return { isPremium, daysLeft, isAdmin, hasFullAccess, pageAccess, accountBadge };
});

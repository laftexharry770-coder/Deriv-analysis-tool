// matches-sniper/js/config.js — deployment configuration (safe to publish: the publishable key is public by design)
(function (root) {
  'use strict';
  root.MS = root.MS || {};
  root.MS.config = {
    supabaseUrl: 'https://omhnpuoxkqmcjfnchryq.supabase.co',
    supabaseKey: 'sb_publishable_FBJ2JlmvvuRX6AW7YD0XUw_zgIl6ZBD',
    brand: 'Binary Analysis Tool',
    priceUsd: 70,
    premiumDays: 30,
    // pages a signed-in but unpaid account may use; everything else needs PREMIUM
    freePages: ['account', 'upgrade', 'support'],
    // owner accounts: full access without email verification or payment (also enforced server-side)
    adminEmails: ['mwangiherbert225@gmail.com', 'thecorinthian999@gmail.com'],
    adminPhones: ['+254758584977'],
    // optional: a stated accuracy range shown on the landing page (e.g. '79% – 95%'); null = describe the live scoring instead
    statedAccuracy: null,
    contact: {
      whatsapp: '+254 751 851 228',
      whatsappLink: 'https://wa.me/254751851228',
      email: 'mwangiherbert225@gmail.com'
    }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);

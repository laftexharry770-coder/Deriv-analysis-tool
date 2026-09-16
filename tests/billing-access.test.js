const test = require('node:test');
const assert = require('node:assert/strict');
const B = require('../js/billing.js');
const A = require('../js/access.js');

test('local method resolves by longest dial-code prefix', () => {
  assert.equal(B.localMethodFor('+254751851228').name, 'M-Pesa');
  assert.equal(B.localMethodFor('254').country, 'Kenya');
  assert.equal(B.localMethodFor('+255 700 000 000').country, 'Tanzania');
  assert.equal(B.localMethodFor('+27 82 000 0000').country, 'South Africa');
  assert.equal(B.localMethodFor('+1 415 555 0100').country, 'USA / Canada');
  assert.equal(B.localMethodFor('+999'), null);
  assert.equal(B.localMethodFor(''), null);
});

test('every method has a guide with price and account id filled in', () => {
  for (const m of B.METHODS) {
    const g = B.guideFor(m.id, { price: 70, accountId: 'MS-AAAA-BBBB', phone: '+254700000000' });
    assert.equal(g.available, true, m.id);
    assert.ok(g.steps.length >= 3, m.id + ' steps');
    assert.ok(!g.steps.some(s => /\{price\}|\{accountId\}/.test(s)), m.id + ' placeholders');
    assert.ok(g.steps.some(s => s.includes('70')), m.id + ' price');
  }
  assert.ok(B.guideFor('skrill', { accountId: 'MS-1' }).steps.some(s => s.includes('MS-1')));
  const none = B.guideFor('local', { phone: '+999' });
  assert.equal(none.available, false); assert.match(none.note, /WhatsApp/);
  assert.equal(B.guideFor('nope', {}).available, false);
});

test('receiving details report what the owner still has to fill in', () => {
  const r = B.receivingDetails('skrill', {}); assert.deepEqual(r.lines, []); assert.deepEqual(r.missing, ['Skrill email']);
  const ok = B.receivingDetails('trust_wallet', { trust_wallet_address: 'TABC', trust_wallet_network: 'TRC20' });
  assert.equal(ok.lines.length, 2); assert.deepEqual(ok.missing, []);
  const local = B.receivingDetails('local', { mpesa_number: '0700' }); assert.deepEqual(local.missing, []); assert.equal(local.lines[0].label, 'Receiving number');
});

test('entitlements', () => {
  const now = Date.parse('2026-09-16T00:00:00Z');
  const cfg = { freePages: ['dashboard', 'frequency', 'account', 'upgrade', 'settings'], adminEmails: ['owner@example.com'] };
  const free = { account_id: 'MS-1', email: 'a@b.c', verified: false, premium_until: null };
  const paid = { account_id: 'MS-2', email: 'p@b.c', verified: true, premium_until: '2026-10-16T00:00:00Z' };
  const lapsed = { account_id: 'MS-3', email: 'l@b.c', verified: true, premium_until: '2026-09-01T00:00:00Z' };
  assert.equal(A.isPremium(free, now), false); assert.equal(A.isPremium(paid, now), true); assert.equal(A.isPremium(lapsed, now), false);
  assert.equal(A.daysLeft(paid, now), 30); assert.equal(A.daysLeft(lapsed, now), 0);
  assert.equal(A.pageAccess('dashboard', null, cfg, now), 'login');
  assert.equal(A.pageAccess('dashboard', free, cfg, now), 'ok');
  assert.equal(A.pageAccess('scanner', free, cfg, now), 'premium');
  assert.equal(A.pageAccess('scanner', paid, cfg, now), 'ok');
  assert.equal(A.pageAccess('signal', lapsed, cfg, now), 'premium');
  assert.equal(A.pageAccess('admin', paid, cfg, now), 'admin');
  assert.equal(A.pageAccess('admin', { email: 'OWNER@example.com' }, cfg, now), 'ok');
  assert.equal(A.pageAccess('admin', { email: 'x@y.z', is_admin: true }, cfg, now), 'ok');
  assert.deepEqual(A.accountBadge(paid, now), { id: 'MS-2', tier: 'PREMIUM', tick: true, daysLeft: 30 });
  assert.deepEqual(A.accountBadge(lapsed, now), { id: 'MS-3', tier: 'FREE', tick: false, daysLeft: 0 });
  assert.equal(A.accountBadge(null), null);
});

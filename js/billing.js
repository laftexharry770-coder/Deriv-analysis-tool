// matches-sniper/js/billing.js — payment methods, step-by-step guides, local transfer by phone country (pure)
(function (root, factory) {
  const mod = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  root.MS = root.MS || {}; root.MS.billing = mod;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Dial code → local money-transfer option. Keyed by the longest matching prefix.
  const LOCAL = {
    '254': { country: 'Kenya', name: 'M-Pesa', kind: 'mpesa', currency: 'KES', steps: [
      'Open the M-PESA menu (or the M-PESA app) and choose Send Money.',
      'Enter the receiving number shown above and confirm the name matches.',
      'Send the KES equivalent of USD {price} at today\'s rate (the amount shown above).',
      'Copy the M-PESA confirmation code (e.g. QGH7XK2M9P) from the SMS.',
      'Paste that code as the reference in the "I have paid" form below and submit.' ] },
    '255': { country: 'Tanzania', name: 'M-Pesa / Tigo Pesa / Airtel Money', kind: 'mobile', currency: 'TZS', steps: [
      'Open your mobile-money menu and choose Send Money (international / to Kenya if the receiving number is Kenyan).',
      'Enter the receiving number shown above and the TZS equivalent of USD {price}.',
      'Confirm with your PIN and keep the transaction ID from the SMS.',
      'Submit that transaction ID as the reference in the form below.' ] },
    '256': { country: 'Uganda', name: 'MTN MoMo / Airtel Money', kind: 'mobile', currency: 'UGX', steps: [
      'Dial the MoMo / Airtel Money menu and choose Send Money.',
      'Enter the receiving number shown above and the UGX equivalent of USD {price}.',
      'Confirm with your PIN and note the transaction ID.',
      'Submit the transaction ID as the reference below.' ] },
    '250': { country: 'Rwanda', name: 'MTN MoMo / Airtel Money', kind: 'mobile', currency: 'RWF', steps: [
      'Open MoMo (*182#) or Airtel Money and choose Send Money.',
      'Enter the receiving number shown above and the RWF equivalent of USD {price}.',
      'Confirm with your PIN and note the transaction ID.',
      'Submit the transaction ID as the reference below.' ] },
    '234': { country: 'Nigeria', name: 'Bank transfer / OPay / PalmPay', kind: 'bank', currency: 'NGN', steps: [
      'Open your bank or OPay/PalmPay app and choose Transfer.',
      'Use the bank details shown above (or the receiving phone number for OPay/PalmPay).',
      'Send the NGN equivalent of USD {price} and keep the session/transaction ID.',
      'Submit that ID as the reference below.' ] },
    '233': { country: 'Ghana', name: 'MTN MoMo / Telecel Cash', kind: 'mobile', currency: 'GHS', steps: [
      'Dial *170# (MTN) or open your mobile-money app and choose Transfer Money.',
      'Enter the receiving number shown above and the GHS equivalent of USD {price}.',
      'Confirm with your PIN and note the transaction ID.',
      'Submit the transaction ID as the reference below.' ] },
    '260': { country: 'Zambia', name: 'Airtel Money / MTN MoMo', kind: 'mobile', currency: 'ZMW', steps: [
      'Open Airtel Money or MTN MoMo and choose Send Money.',
      'Enter the receiving number shown above and the ZMW equivalent of USD {price}.',
      'Confirm with your PIN and note the transaction ID.',
      'Submit the transaction ID as the reference below.' ] },
    '263': { country: 'Zimbabwe', name: 'EcoCash / bank transfer', kind: 'mobile', currency: 'USD', steps: [
      'Open EcoCash (*151#) and choose Send Money, or use your bank app.',
      'Enter the receiving number shown above and USD {price}.',
      'Confirm with your PIN and note the transaction ID.',
      'Submit the transaction ID as the reference below.' ] },
    '27': { country: 'South Africa', name: 'Bank EFT / Capitec Pay', kind: 'bank', currency: 'ZAR', steps: [
      'Open your banking app and add the beneficiary using the bank details shown above.',
      'Pay the ZAR equivalent of USD {price} with your account ID as the payment reference.',
      'Download or screenshot the proof of payment.',
      'Submit the payment reference below.' ] },
    '91': { country: 'India', name: 'UPI / IMPS', kind: 'bank', currency: 'INR', steps: [
      'Open your UPI app and pay to the UPI ID or bank details shown above.',
      'Send the INR equivalent of USD {price} and note the UTR number.',
      'Submit the UTR number as the reference below.' ] },
    '92': { country: 'Pakistan', name: 'JazzCash / Easypaisa', kind: 'mobile', currency: 'PKR', steps: [
      'Open JazzCash or Easypaisa and choose Send Money.',
      'Enter the receiving number shown above and the PKR equivalent of USD {price}.',
      'Note the transaction ID and submit it as the reference below.' ] },
    '63': { country: 'Philippines', name: 'GCash / Maya', kind: 'mobile', currency: 'PHP', steps: [
      'Open GCash or Maya and choose Send Money.',
      'Enter the receiving number shown above and the PHP equivalent of USD {price}.',
      'Note the reference number and submit it below.' ] },
    '44': { country: 'United Kingdom', name: 'Bank transfer (Faster Payments)', kind: 'bank', currency: 'GBP', steps: [
      'Open your banking app and add the payee using the bank details shown above.',
      'Send the GBP equivalent of USD {price} with your account ID as the reference.',
      'Submit the payment reference below.' ] },
    '1': { country: 'USA / Canada', name: 'Zelle / Interac / bank transfer', kind: 'bank', currency: 'USD', steps: [
      'Open your banking app and send USD {price} to the bank details shown above (Zelle/Interac where available).',
      'Use your account ID as the memo.',
      'Submit the confirmation number below.' ] }
  };

  function dialCodeOf(phoneOrCode) {
    const digits = String(phoneOrCode || '').replace(/\D/g, '');
    return digits;
  }
  /** Longest known dial-code prefix of a phone number / country code, or null. */
  function localMethodFor(phoneOrCode) {
    const d = dialCodeOf(phoneOrCode);
    for (let len = 3; len >= 1; len--) { const k = d.slice(0, len); if (LOCAL[k]) return Object.assign({ dial: k }, LOCAL[k]); }
    return null;
  }

  const METHODS = [
    { id: 'skrill', name: 'Skrill', short: 'Skrill', fee: 'Skrill-to-Skrill transfers are usually free or ~1.45%', fields: ['skrill_email'], steps: [
      'Log in to Skrill (app or skrill.com) and open Send → Skrill to Skrill.',
      'Enter the receiving Skrill email shown above.',
      'Amount: USD {price} (choose USD; let Skrill convert if your wallet is in another currency).',
      'Put your account ID ({accountId}) in the message field, then confirm.',
      'Copy the Transaction ID from Skrill → History and submit it as the reference below.' ] },
    { id: 'trust_wallet', name: 'Trust Wallet (USDT)', short: 'Trust Wallet', fee: 'network fee only — send on the network shown above', fields: ['trust_wallet_address', 'trust_wallet_network'], steps: [
      'Open Trust Wallet and select USDT on the network shown above (wrong network = lost funds).',
      'Tap Send, paste the receiving address shown above and double-check the first and last 4 characters.',
      'Amount: {price} USDT (plus your network fee).',
      'Confirm the transaction and wait for it to show as completed.',
      'Copy the transaction hash (TxID) and submit it as the reference below.' ] },
    { id: 'binance', name: 'Binance Pay', short: 'Binance', fee: 'Binance Pay is free between Binance users', fields: ['binance_pay_id', 'binance_uid'], steps: [
      'Open the Binance app → Pay → Send.',
      'Choose "Pay ID" or "Binance UID" and enter the ID shown above.',
      'Select USDT (or USD-equivalent) and enter {price}.',
      'Add your account ID ({accountId}) as the note and confirm with your PIN.',
      'Copy the Order ID from Pay → Transaction history and submit it as the reference below.' ] },
    { id: 'bank', name: 'Bank transfer', short: 'Bank', fee: 'your bank\'s transfer fee applies', fields: ['bank_details'], steps: [
      'Open your banking app and add a new payee with the bank details shown above.',
      'Transfer the equivalent of USD {price} (international transfers may take 1–3 working days).',
      'Use your account ID ({accountId}) as the payment reference.',
      'Keep the receipt or transaction reference and submit it below.' ] },
    { id: 'local', name: 'Local money transfer', short: 'Local', fee: 'local transfer fees apply', fields: ['mpesa_number', 'mpesa_name'], steps: [] }
  ];

  function methodById(id) { return METHODS.find((m) => m.id === id) || null; }

  /** Guide steps for a method, with {price} / {accountId} filled in. For 'local' the steps depend on the phone country. */
  function guideFor(methodId, ctx) {
    ctx = ctx || {};
    const price = ctx.price == null ? 70 : ctx.price;
    const m = methodById(methodId);
    if (!m) return { title: 'Unknown method', steps: [], available: false };
    let steps = m.steps, title = m.name, available = true, local = null;
    if (methodId === 'local') {
      local = localMethodFor(ctx.phone || ctx.countryCode);
      if (!local) return { title: 'Local money transfer', steps: [], available: false, local: null, note: 'No local transfer option is listed for your phone number\'s country yet — message the owner on WhatsApp for the best local option.' };
      title = local.name + ' (' + local.country + ')'; steps = local.steps;
    }
    const fill = (s) => s.replace(/\{price\}/g, String(price)).replace(/\{accountId\}/g, ctx.accountId || 'your account ID');
    return { title, steps: steps.map(fill), available, local, fee: m.fee };
  }

  /** Receiving details for a method from the owner's settings; `missing` lists fields the owner has not filled in yet. */
  function receivingDetails(methodId, settings) {
    settings = settings || {};
    const m = methodById(methodId); if (!m) return { lines: [], missing: [] };
    const labels = { skrill_email: 'Skrill email', trust_wallet_address: 'USDT address', trust_wallet_network: 'Network', binance_pay_id: 'Binance Pay ID', binance_uid: 'Binance UID', bank_details: 'Bank details', mpesa_number: 'Receiving number', mpesa_name: 'Registered name' };
    const lines = [], missing = [];
    for (const f of m.fields) { const v = settings[f]; if (v) lines.push({ label: labels[f] || f, value: String(v) }); else if (f !== 'binance_uid' && f !== 'mpesa_name') missing.push(labels[f] || f); }
    return { lines, missing };
  }

  return { METHODS, LOCAL, methodById, localMethodFor, guideFor, receivingDetails };
});

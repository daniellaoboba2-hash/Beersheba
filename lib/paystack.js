'use strict';
const https = require('https');

const SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || '';
const PUBLIC_KEY = process.env.PAYSTACK_PUBLIC_KEY || '';
const LIVE = !!SECRET_KEY;

function request(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = https.request(
      {
        hostname: 'api.paystack.co',
        path: urlPath,
        method,
        headers: {
          Authorization: `Bearer ${SECRET_KEY}`,
          'Content-Type': 'application/json',
          ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        },
      },
      (res) => {
        let chunks = '';
        res.on('data', (c) => (chunks += c));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(chunks) });
          } catch (e) {
            resolve({ status: res.statusCode, body: chunks });
          }
        });
      }
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

/**
 * Initialize a transaction. In LIVE mode this calls the real Paystack API.
 * In DEV mode (no secret key set — the default for this project until you
 * add one) it returns a fake reference and a link to our own /checkout page,
 * which lets you exercise the full purchase → entitlement → library flow
 * without a payment provider connected. Swap in your keys via environment
 * variables to go live — no other code changes needed.
 */
async function initializeTransaction({ email, amountCents, currency, reference, callbackUrl, metadata }) {
  if (!LIVE) {
    return {
      ok: true,
      dev: true,
      reference,
      authorization_url: `/checkout.html?ref=${encodeURIComponent(reference)}`,
    };
  }
  const resp = await request('POST', '/transaction/initialize', {
    email,
    amount: amountCents, // Paystack expects the currency's smallest unit
    currency,
    reference,
    callback_url: callbackUrl,
    metadata,
  });
  if (resp.status >= 200 && resp.status < 300 && resp.body && resp.body.status) {
    return { ok: true, dev: false, reference, authorization_url: resp.body.data.authorization_url };
  }
  return { ok: false, error: (resp.body && resp.body.message) || 'Paystack initialization failed.' };
}

/** Verify a transaction by reference. DEV mode always reports success (simulator). */
async function verifyTransaction(reference) {
  if (!LIVE) {
    return { ok: true, dev: true, status: 'success', reference };
  }
  const resp = await request('GET', `/transaction/verify/${encodeURIComponent(reference)}`);
  if (resp.status >= 200 && resp.status < 300 && resp.body && resp.body.status) {
    return { ok: true, dev: false, status: resp.body.data.status, reference, raw: resp.body.data };
  }
  return { ok: false, error: (resp.body && resp.body.message) || 'Paystack verification failed.' };
}

module.exports = { initializeTransaction, verifyTransaction, LIVE, PUBLIC_KEY };

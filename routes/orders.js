'use strict';
const db = require('../lib/db');
const crypto = require('crypto');
const { id, sendJSON, badRequest, notFound, forbidden } = require('../lib/util');
const { requireAuth } = require('../lib/auth');
const access = require('../lib/access');
const paystack = require('../lib/paystack');

function register(router) {
  // Step 1: reader picks a product -> we create a PENDING order at the
  // product's CURRENT database price (never trust a client-supplied amount).
  router.post('/api/orders', async (req, res, params, body) => {
    const user = requireAuth(req, res);
    if (!user) return;
    if (!body.productId) return badRequest(res, 'productId is required.');
    const product = db.prepare('SELECT * FROM products WHERE id = ? AND active = 1').get(body.productId);
    if (!product) return notFound(res, 'Product not found or inactive.');

    // Lifetime VIP is a one-time membership — block a second purchase at
    // order-creation time (server-side), not just by hiding the button.
    if (product.type === 'VIP_MEMBERSHIP' && access.isVip(user.id)) {
      return badRequest(res, "You're already a Lifetime VIP member — no need to purchase again.");
    }

    const orderId = id();
    const reference = `BSH-${orderId.slice(0, 8)}-${Date.now()}`;
    db.prepare(
      `INSERT INTO orders (id, user_id, product_id, amount_cents, currency, provider, provider_reference, status)
       VALUES (?,?,?,?,?, 'paystack', ?, 'PENDING')`
    ).run(orderId, user.id, product.id, product.price_cents, product.currency, reference);

    const init = await paystack.initializeTransaction({
      email: user.email,
      amountCents: product.price_cents,
      currency: product.currency,
      reference,
      callbackUrl: `${req.headers.origin || ''}/checkout-complete.html?order=${orderId}`,
      metadata: { orderId, productType: product.type },
    });

    if (!init.ok) {
      db.prepare(`UPDATE orders SET status='FAILED' WHERE id=?`).run(orderId);
      return badRequest(res, init.error || 'Could not start payment.');
    }

    sendJSON(res, 200, {
      orderId,
      reference,
      amount: (product.price_cents / 100).toFixed(2),
      currency: product.currency,
      productName: product.name,
      productType: product.type,
      dev: !!init.dev,
      authorizationUrl: init.authorization_url,
      publicKey: paystack.PUBLIC_KEY || null,
    });
  });

  router.get('/api/orders/:id', async (req, res, { id: orderId }) => {
    const user = requireAuth(req, res);
    if (!user) return;
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
    if (!order) return notFound(res, 'Order not found.');
    if (order.user_id !== user.id && user.role !== 'ADMIN') return forbidden(res);
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(order.product_id);
    sendJSON(res, 200, { ...order, product });
  });

  // Step 2: verify payment with Paystack, then grant the entitlement / VIP.
  router.post('/api/orders/:id/verify', async (req, res, { id: orderId }) => {
    const user = requireAuth(req, res);
    if (!user) return;
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
    if (!order || order.user_id !== user.id) return notFound(res, 'Order not found.');
    if (order.status === 'PAID') {
      return sendJSON(res, 200, { status: 'PAID', alreadyProcessed: true });
    }

    const verification = await paystack.verifyTransaction(order.provider_reference);
    if (!verification.ok) return badRequest(res, verification.error);

    if (verification.status !== 'success') {
      db.prepare(`UPDATE orders SET status='FAILED', updated_at=datetime('now') WHERE id=?`).run(orderId);
      return sendJSON(res, 200, { status: 'FAILED' });
    }

    db.prepare(`UPDATE orders SET status='PAID', updated_at=datetime('now') WHERE id=?`).run(orderId);
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(order.product_id);

    let entitlementId = null;
    if (product.type === 'VIP_MEMBERSHIP') {
      access.grantVip(user.id, order.id, order.provider_reference);
    } else {
      entitlementId = access.grantEntitlement(user.id, order.id, product.id, product.type);
    }

    sendJSON(res, 200, { status: 'PAID', dev: !!verification.dev, entitlementId, productType: product.type });
  });

  // Step 3 (standard tiers only): spend the entitlement on one chosen book.
  router.post('/api/entitlements/:id/consume', async (req, res, { id: entId }, body) => {
    const user = requireAuth(req, res);
    if (!user) return;
    if (!body.bookId) return badRequest(res, 'bookId is required.');
    const result = access.consumeEntitlement(user.id, entId, body.bookId);
    if (!result.ok) return badRequest(res, result.error);
    sendJSON(res, 200, { ok: true });
  });

  router.get('/api/entitlements', async (req, res) => {
    const user = requireAuth(req, res);
    if (!user) return;
    sendJSON(res, 200, db.prepare('SELECT * FROM entitlements WHERE user_id = ? ORDER BY created_at DESC').all(user.id));
  });

  // Eligible books for a given UNUSED entitlement ("Choose Your Book" screen).
  router.get('/api/entitlements/:id/eligible-books', async (req, res, { id: entId }) => {
    const user = requireAuth(req, res);
    if (!user) return;
    const ent = db.prepare('SELECT * FROM entitlements WHERE id = ? AND user_id = ?').get(entId, user.id);
    if (!ent) return notFound(res, 'Entitlement not found.');
    const books = db
      .prepare(
        `SELECT b.* FROM books b
         JOIN book_product_access bpa ON bpa.book_id = b.id
         WHERE b.status='PUBLISHED' AND bpa.product_id = ?`
      )
      .all(ent.product_id);
    sendJSON(res, 200, { entitlement: ent, books: books.map((b) => ({ id: b.id, slug: b.slug, title: b.title, cover: b.cover_image, author: b.author })) });
  });
}

module.exports = register;

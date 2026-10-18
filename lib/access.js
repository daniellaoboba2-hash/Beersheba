'use strict';
const db = require('./db');
const { id } = require('./util');

async function isVip(userId) {
  const row = await db.prepare(`SELECT 1 FROM vip_memberships WHERE user_id = ? AND status = 'ACTIVE'`).get(userId);
  return !!row;
}

async function getBook(bookId) {
  return db.prepare('SELECT * FROM books WHERE id = ?').get(bookId);
}

/** Does this user already have this book in their library (bought or VIP)? */
async function hasLibraryAccess(userId, bookId) {
  const row = await db.prepare('SELECT 1 FROM library_items WHERE user_id = ? AND book_id = ?').get(userId, bookId);
  return !!row;
}

async function addToLibrary(userId, bookId, source) {
  try {
    await db.prepare(
      `INSERT OR IGNORE INTO library_items (id, user_id, book_id, source) VALUES (?, ?, ?, ?)`
    ).run(id(), userId, bookId, source);
  } catch (e) {
    // duplicate — fine, already in library
  }
}

/**
 * Full server-side gate for "can this user read chapter N of this book right now".
 * Ignores anything the client claims about entitlement state.
 */
async function canReadChapter(userId, book, chapterNumber) {
  if (!book || book.status !== 'PUBLISHED') return { allowed: false, reason: 'Book not available.' };

  if (chapterNumber <= (book.free_preview_chapters || 0)) {
    return { allowed: true, reason: 'preview' };
  }

  if (!userId) return { allowed: false, reason: 'Sign in required.' };

  if (book.vip_exclusive) {
    return (await isVip(userId))
      ? { allowed: true, reason: 'vip' }
      : { allowed: false, reason: 'This story is VIP-exclusive.' };
  }

  if ((await isVip(userId)) && book.vip_eligible) {
    return { allowed: true, reason: 'vip' };
  }

  if (await hasLibraryAccess(userId, book.id)) {
    return { allowed: true, reason: 'purchased' };
  }

  return { allowed: false, reason: 'Unlock this story to keep reading.' };
}

/**
 * Consume a standard (one-time) entitlement against a chosen book.
 * Enforced rules (server-side, authoritative):
 *  - entitlement must belong to the user
 *  - entitlement must currently be UNUSED
 *  - the book must explicitly opt into the entitlement's product (via
 *    book_product_access — an admin-controlled relationship, not inferred
 *    from chapter count)
 *  - once consumed it can never be reused for a different book
 */
async function consumeEntitlement(userId, entitlementId, bookId) {
  const ent = await db.prepare('SELECT * FROM entitlements WHERE id = ?').get(entitlementId);
  if (!ent || ent.user_id !== userId) {
    return { ok: false, error: 'Entitlement not found.' };
  }
  if (ent.status !== 'UNUSED') {
    return { ok: false, error: `This entitlement is already ${ent.status.toLowerCase()}.` };
  }
  const book = await getBook(bookId);
  if (!book || book.status !== 'PUBLISHED') {
    return { ok: false, error: 'Book not available.' };
  }
  const eligible = await db
    .prepare('SELECT 1 FROM book_product_access WHERE book_id = ? AND product_id = ?')
    .get(bookId, ent.product_id);
  if (!eligible) {
    return { ok: false, error: 'This book is not eligible for that access product.' };
  }

  const now = new Date().toISOString();
  await db.prepare(`UPDATE entitlements SET status = 'CONSUMED', book_id = ?, consumed_at = ? WHERE id = ?`).run(
    bookId,
    now,
    entitlementId
  );
  await addToLibrary(userId, bookId, 'ENTITLEMENT');
  return { ok: true };
}

async function grantEntitlement(userId, orderId, productId, entitlementType) {
  const entId = id();
  await db.prepare(
    `INSERT INTO entitlements (id, user_id, order_id, product_id, type, status) VALUES (?, ?, ?, ?, ?, 'UNUSED')`
  ).run(entId, userId, orderId, productId, entitlementType);
  return entId;
}

async function grantVip(userId, orderId, reference) {
  const existing = await db.prepare('SELECT * FROM vip_memberships WHERE user_id = ?').get(userId);
  if (existing) {
    await db.prepare(`UPDATE vip_memberships SET status = 'ACTIVE', order_id = ?, payment_reference = ? WHERE user_id = ?`).run(
      orderId,
      reference,
      userId
    );
    return existing.id;
  }
  const vipId = id();
  await db.prepare(
    `INSERT INTO vip_memberships (id, user_id, order_id, payment_reference, status) VALUES (?, ?, ?, ?, 'ACTIVE')`
  ).run(vipId, userId, orderId, reference);
  return vipId;
}

/** Eligible book IDs for a VIP member: anything vip_eligible OR vip_exclusive and published. */
function vipCatalogueFilter() {
  return `(vip_eligible = 1 OR vip_exclusive = 1) AND status = 'PUBLISHED'`;
}

/**
 * Server-side gate for PDF downloads — mirrors canReadChapter's logic but
 * for the whole-book PDF asset. A PDF's URL is never public; every download
 * goes through this check via GET /api/books/:id/pdf.
 *
 * VIP PDF access and standard-purchase PDF access are deliberately checked
 * against *how* the reader got the book, not just whether they have it in
 * their library — a book that's only pdf_standard_access-enabled must not
 * become downloadable for a VIP reader who has it via VIP browsing alone.
 */
async function canDownloadPdf(userId, book) {
  if (!book || book.status !== 'PUBLISHED') return { allowed: false, reason: 'Book not available.' };
  if (!book.pdf_enabled || !book.pdf_url) return { allowed: false, reason: 'No PDF is available for this book.' };
  if (!userId) return { allowed: false, reason: 'Sign in required.' };
  if ((await isVip(userId)) && book.pdf_eligible) return { allowed: true };
  if (book.pdf_standard_access) {
    const purchased = await db
      .prepare(`SELECT 1 FROM library_items WHERE user_id = ? AND book_id = ? AND source = 'ENTITLEMENT'`)
      .get(userId, book.id);
    if (purchased) return { allowed: true };
  }
  return { allowed: false, reason: 'PDF download is not included with your current access to this book.' };
}

module.exports = {
  isVip,
  hasLibraryAccess,
  addToLibrary,
  canReadChapter,
  canDownloadPdf,
  consumeEntitlement,
  grantEntitlement,
  grantVip,
  vipCatalogueFilter,
};

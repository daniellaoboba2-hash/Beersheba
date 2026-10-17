'use strict';
const fs = require('fs');
const path = require('path');
const db = require('../lib/db');
const { id, slugify, sendJSON, badRequest, notFound } = require('../lib/util');
const { requireAdmin, publicUser } = require('../lib/auth');
const { logAction } = require('../lib/audit');
const { validateBookForPublish } = require('../lib/validation');
const statsLib = require('../lib/stats');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
// PDFs live OUTSIDE the publicly-served /uploads directory on purpose —
// see server.js's static route, which only ever serves UPLOAD_DIR. A PDF's
// only path to a reader is through the authorized /api/books/:id/pdf route.
const PRIVATE_DIR = path.join(__dirname, '..', 'private-uploads');
if (!fs.existsSync(PRIVATE_DIR)) fs.mkdirSync(PRIVATE_DIR, { recursive: true });

function setBookGenres(bookId, genreIds) {
  db.prepare('DELETE FROM book_genres WHERE book_id = ?').run(bookId);
  (genreIds || []).forEach((gid) => db.prepare('INSERT OR IGNORE INTO book_genres (book_id, genre_id) VALUES (?,?)').run(bookId, gid));
}
function setBookTags(bookId, tagIds) {
  db.prepare('DELETE FROM book_tags WHERE book_id = ?').run(bookId);
  (tagIds || []).forEach((tid) => db.prepare('INSERT OR IGNORE INTO book_tags (book_id, tag_id) VALUES (?,?)').run(bookId, tid));
}

function fullBook(bookId) {
  const book = db.prepare('SELECT * FROM books WHERE id = ?').get(bookId);
  if (!book) return null;
  const genres = db.prepare(`SELECT g.id, g.name FROM genres g JOIN book_genres bg ON bg.genre_id=g.id WHERE bg.book_id=?`).all(bookId);
  const tags = db.prepare(`SELECT t.id, t.name FROM tags t JOIN book_tags bt ON bt.tag_id=t.id WHERE bt.book_id=?`).all(bookId);
  const chapterCount = db.prepare('SELECT COUNT(*) c FROM chapters WHERE book_id=?').get(bookId).c;
  return { ...book, genres, tags, chapterCount, accessTiers: JSON.parse(book.access_tiers || '[]') };
}

function register(router) {
  // ---------------------------------------------------------------- dashboard
  router.get('/api/admin/dashboard', async (req, res) => {
    if (!requireAdmin(req, res)) return;
    sendJSON(res, 200, statsLib.adminDashboard());
  });

  // ------------------------------------------------------------------- books
  router.get('/api/admin/books', async (req, res, params, body, query) => {
    if (!requireAdmin(req, res)) return;
    let sql = 'SELECT * FROM books';
    const args = [];
    if (query.status) {
      sql += ' WHERE status = ?';
      args.push(query.status.toUpperCase());
    }
    sql += ' ORDER BY updated_at DESC';
    const books = db.prepare(sql).all(...args);
    sendJSON(res, 200, books.map((b) => fullBook(b.id)));
  });

  router.post('/api/admin/books', async (req, res, params, body) => {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    if (!body.title) return badRequest(res, 'Title is required.');
    const bookId = id();
    let slug = slugify(body.title);
    if (db.prepare('SELECT 1 FROM books WHERE slug = ?').get(slug)) slug = `${slug}-${bookId.slice(0, 6)}`;
    db.prepare(
      `INSERT INTO books (
        id, slug, title, subtitle, author, synopsis, short_description, original_language,
        cover_image, featured_image, social_image, access_tiers, vip_eligible, vip_exclusive,
        pdf_eligible, free_preview_chapters, featured, trending, best_seller, new_release,
        seo_title, meta_description, status
      ) VALUES (?,?,?,?,?,?,?,?, ?,?,?,?,?,?, ?,?,?,?,?,?, ?,?, 'DRAFT')`
    ).run(
      bookId, slug, body.title, body.subtitle || null, body.author || 'Beersheba', body.synopsis || null,
      body.shortDescription || null, body.originalLanguage || 'English',
      body.cover || null, body.featuredImage || null, body.socialImage || null,
      JSON.stringify(body.accessTiers || []), body.vipEligible ? 1 : 0, body.vipExclusive ? 1 : 0,
      body.pdfEligible ? 1 : 0, body.freePreviewChapters ?? 1,
      body.featured ? 1 : 0, body.trending ? 1 : 0, body.bestSeller ? 1 : 0, body.newRelease ? 1 : 0,
      body.seoTitle || body.title, body.metaDescription || body.shortDescription || null
    );
    setBookGenres(bookId, body.genreIds);
    setBookTags(bookId, body.tagIds);
    logAction(admin.id, 'BOOK_CREATED', 'book', bookId, { title: body.title });
    sendJSON(res, 201, fullBook(bookId));
  });

  router.get('/api/admin/books/:id', async (req, res, { id: bookId }) => {
    if (!requireAdmin(req, res)) return;
    const book = fullBook(bookId);
    if (!book) return notFound(res, 'Book not found.');
    sendJSON(res, 200, book);
  });

  const BOOK_FIELD_MAP = {
    title: 'title', subtitle: 'subtitle', author: 'author', synopsis: 'synopsis',
    shortDescription: 'short_description', originalLanguage: 'original_language',
    cover: 'cover_image', featuredImage: 'featured_image', socialImage: 'social_image',
    freePreviewChapters: 'free_preview_chapters', seoTitle: 'seo_title', metaDescription: 'meta_description', slug: 'slug',
  };
  const BOOK_BOOL_MAP = {
    vipEligible: 'vip_eligible', vipExclusive: 'vip_exclusive', pdfEligible: 'pdf_eligible',
    pdfEnabled: 'pdf_enabled', pdfStandardAccess: 'pdf_standard_access',
    featured: 'featured', trending: 'trending', bestSeller: 'best_seller', newRelease: 'new_release',
  };

  router.patch('/api/admin/books/:id', async (req, res, { id: bookId }, body) => {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    const book = db.prepare('SELECT * FROM books WHERE id = ?').get(bookId);
    if (!book) return notFound(res, 'Book not found.');

    const sets = [];
    const args = [];
    Object.entries(BOOK_FIELD_MAP).forEach(([key, col]) => {
      if (body[key] !== undefined) { sets.push(`${col} = ?`); args.push(body[key]); }
    });
    Object.entries(BOOK_BOOL_MAP).forEach(([key, col]) => {
      if (body[key] !== undefined) { sets.push(`${col} = ?`); args.push(body[key] ? 1 : 0); }
    });
    if (body.accessTiers !== undefined) { sets.push('access_tiers = ?'); args.push(JSON.stringify(body.accessTiers)); }
    if (sets.length) {
      sets.push("updated_at = datetime('now')");
      args.push(bookId);
      db.prepare(`UPDATE books SET ${sets.join(', ')} WHERE id = ?`).run(...args);
    }
    if (body.genreIds !== undefined) setBookGenres(bookId, body.genreIds);
    if (body.tagIds !== undefined) setBookTags(bookId, body.tagIds);

    logAction(admin.id, 'BOOK_EDITED', 'book', bookId, { fields: Object.keys(body) });
    sendJSON(res, 200, fullBook(bookId));
  });

  router.post('/api/admin/books/:id/publish', async (req, res, { id: bookId }, body) => {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    const book = db.prepare('SELECT * FROM books WHERE id = ?').get(bookId);
    if (!book) return notFound(res, 'Book not found.');

    const validation = validateBookForPublish(book);
    if (!validation.valid) {
      return sendJSON(res, 422, {
        error: `Cannot publish this book. ${validation.issues.length} issue(s) found.`,
        issues: validation.issues,
      });
    }

    if (body.scheduledAt) {
      db.prepare(`UPDATE books SET status='SCHEDULED', scheduled_at=?, updated_at=datetime('now') WHERE id=?`).run(body.scheduledAt, bookId);
      logAction(admin.id, 'BOOK_SCHEDULED', 'book', bookId, { scheduledAt: body.scheduledAt });
    } else {
      db.prepare(`UPDATE books SET status='PUBLISHED', published_at=datetime('now'), updated_at=datetime('now') WHERE id=?`).run(bookId);
      logAction(admin.id, 'BOOK_PUBLISHED', 'book', bookId, {});
    }
    sendJSON(res, 200, fullBook(bookId));
  });

  router.post('/api/admin/books/:id/unpublish', async (req, res, { id: bookId }) => {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    db.prepare(`UPDATE books SET status='UNPUBLISHED', updated_at=datetime('now') WHERE id=?`).run(bookId);
    logAction(admin.id, 'BOOK_UNPUBLISHED', 'book', bookId, {});
    sendJSON(res, 200, fullBook(bookId));
  });

  router.post('/api/admin/books/:id/archive', async (req, res, { id: bookId }) => {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    db.prepare(`UPDATE books SET status='ARCHIVED', updated_at=datetime('now') WHERE id=?`).run(bookId);
    logAction(admin.id, 'BOOK_ARCHIVED', 'book', bookId, {});
    sendJSON(res, 200, fullBook(bookId));
  });

  router.post('/api/admin/books/:id/validate', async (req, res, { id: bookId }) => {
    if (!requireAdmin(req, res)) return;
    const book = db.prepare('SELECT * FROM books WHERE id = ?').get(bookId);
    if (!book) return notFound(res, 'Book not found.');
    sendJSON(res, 200, validateBookForPublish(book));
  });

  // ------------------------------------------------------------------ PDF
  router.post('/api/admin/books/:id/pdf', async (req, res, { id: bookId }, body) => {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    const book = db.prepare('SELECT * FROM books WHERE id = ?').get(bookId);
    if (!book) return notFound(res, 'Book not found.');
    if (!body.filename || !body.dataBase64) return badRequest(res, 'filename and dataBase64 are required.');
    if (path.extname(body.filename).toLowerCase() !== '.pdf') {
      return badRequest(res, 'Please upload a PDF file. Existing PDF kept.');
    }
    const buf = Buffer.from(body.dataBase64, 'base64');
    if (buf.length > 25 * 1024 * 1024) return badRequest(res, 'PDF is larger than 25MB. Existing PDF kept.');

    const mediaId = id();
    const storedName = `${mediaId}.pdf`;
    try {
      fs.writeFileSync(path.join(PRIVATE_DIR, storedName), buf);
    } catch (e) {
      return sendJSON(res, 500, { error: 'Upload failed. Existing PDF kept.' });
    }
    db.prepare(
      `INSERT INTO media (id, filename, original_name, type, size_bytes, book_id) VALUES (?,?,?,?,?,?)`
    ).run(mediaId, storedName, body.filename, 'PDF', buf.length, bookId);

    // Best-effort cleanup of the previous PDF file.
    if (book.pdf_url && book.pdf_url.startsWith('private:')) {
      try { fs.unlinkSync(path.join(PRIVATE_DIR, book.pdf_url.replace('private:', ''))); } catch (e) { /* already gone */ }
    }
    db.prepare(
      `UPDATE books SET pdf_url = ?, pdf_filename = ?, pdf_size_bytes = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(`private:${storedName}`, body.filename, buf.length, bookId);
    logAction(admin.id, 'PDF_UPLOADED', 'book', bookId, { filename: body.filename, sizeBytes: buf.length });
    sendJSON(res, 200, fullBook(bookId));
  });

  router.delete('/api/admin/books/:id/pdf', async (req, res, { id: bookId }) => {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    const book = db.prepare('SELECT * FROM books WHERE id = ?').get(bookId);
    if (!book) return notFound(res, 'Book not found.');
    if (book.pdf_url && book.pdf_url.startsWith('private:')) {
      try { fs.unlinkSync(path.join(PRIVATE_DIR, book.pdf_url.replace('private:', ''))); } catch (e) { /* already gone */ }
      db.prepare(`DELETE FROM media WHERE book_id = ? AND type = 'PDF'`).run(bookId);
    }
    db.prepare(
      `UPDATE books SET pdf_url = NULL, pdf_filename = NULL, pdf_size_bytes = NULL, pdf_enabled = 0, updated_at = datetime('now') WHERE id = ?`
    ).run(bookId);
    logAction(admin.id, 'PDF_REMOVED', 'book', bookId, {});
    sendJSON(res, 200, fullBook(bookId));
  });

  // ---------------------------------------------------------------- chapters
  router.get('/api/admin/books/:id/chapters', async (req, res, { id: bookId }) => {
    if (!requireAdmin(req, res)) return;
    sendJSON(res, 200, db.prepare('SELECT * FROM chapters WHERE book_id = ? ORDER BY order_index').all(bookId));
  });

  router.post('/api/admin/books/:id/chapters', async (req, res, { id: bookId }, body) => {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    const book = db.prepare('SELECT * FROM books WHERE id = ?').get(bookId);
    if (!book) return notFound(res, 'Book not found.');
    const maxOrder = db.prepare('SELECT MAX(order_index) m FROM chapters WHERE book_id = ?').get(bookId).m || 0;
    const maxNumber = db.prepare('SELECT MAX(number) m FROM chapters WHERE book_id = ?').get(bookId).m || 0;
    const chapterId = id();
    const number = body.number || maxNumber + 1;
    db.prepare(
      `INSERT INTO chapters (id, book_id, number, order_index, title, content, is_preview, status)
       VALUES (?,?,?,?,?,?,?, 'DRAFT')`
    ).run(chapterId, bookId, number, maxOrder + 1, body.title || `Chapter ${number}`, body.content || '', body.isPreview ? 1 : 0);
    logAction(admin.id, 'CHAPTER_CREATED', 'chapter', chapterId, { bookId, number });
    sendJSON(res, 201, db.prepare('SELECT * FROM chapters WHERE id = ?').get(chapterId));
  });

  router.post('/api/admin/books/:id/chapters/reorder', async (req, res, { id: bookId }, body) => {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    const order = body.order || []; // [{id, orderIndex}]
    const tx = db.prepare('UPDATE chapters SET order_index = ? WHERE id = ? AND book_id = ?');
    order.forEach((o) => tx.run(o.orderIndex, o.id, bookId));
    logAction(admin.id, 'CHAPTERS_REORDERED', 'book', bookId, { count: order.length });
    sendJSON(res, 200, db.prepare('SELECT * FROM chapters WHERE book_id = ? ORDER BY order_index').all(bookId));
  });

  router.patch('/api/admin/chapters/:id', async (req, res, { id: chapterId }, body) => {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    const chapter = db.prepare('SELECT * FROM chapters WHERE id = ?').get(chapterId);
    if (!chapter) return notFound(res, 'Chapter not found.');
    const sets = ["updated_at = datetime('now')"];
    const args = [];
    if (body.title !== undefined) { sets.push('title = ?'); args.push(body.title); }
    if (body.content !== undefined) { sets.push('content = ?'); args.push(body.content); }
    if (body.number !== undefined) { sets.push('number = ?'); args.push(body.number); }
    if (body.isPreview !== undefined) { sets.push('is_preview = ?'); args.push(body.isPreview ? 1 : 0); }
    if (body.voiceEnabled !== undefined) { sets.push('voice_enabled = ?'); args.push(body.voiceEnabled ? 1 : 0); }
    if (body.audioStatus !== undefined) { sets.push('audio_status = ?'); args.push(body.audioStatus); }
    args.push(chapterId);
    db.prepare(`UPDATE chapters SET ${sets.join(', ')} WHERE id = ?`).run(...args);
    logAction(admin.id, 'CHAPTER_EDITED', 'chapter', chapterId, { fields: Object.keys(body) });
    sendJSON(res, 200, db.prepare('SELECT * FROM chapters WHERE id = ?').get(chapterId));
  });

  router.post('/api/admin/chapters/:id/publish', async (req, res, { id: chapterId }, body) => {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    const chapter = db.prepare('SELECT * FROM chapters WHERE id = ?').get(chapterId);
    if (!chapter) return notFound(res, 'Chapter not found.');
    if (!chapter.content || !chapter.content.trim()) return badRequest(res, 'Chapter has no content.');
    if (body.scheduledAt) {
      db.prepare(`UPDATE chapters SET status='SCHEDULED', scheduled_at=? WHERE id=?`).run(body.scheduledAt, chapterId);
    } else {
      db.prepare(`UPDATE chapters SET status='PUBLISHED', published_at=datetime('now') WHERE id=?`).run(chapterId);
    }
    logAction(admin.id, 'CHAPTER_PUBLISHED', 'chapter', chapterId, {});
    sendJSON(res, 200, db.prepare('SELECT * FROM chapters WHERE id = ?').get(chapterId));
  });

  router.post('/api/admin/chapters/:id/unpublish', async (req, res, { id: chapterId }) => {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    db.prepare(`UPDATE chapters SET status='UNPUBLISHED' WHERE id=?`).run(chapterId);
    logAction(admin.id, 'CHAPTER_UNPUBLISHED', 'chapter', chapterId, {});
    sendJSON(res, 200, { ok: true });
  });

  router.delete('/api/admin/chapters/:id', async (req, res, { id: chapterId }) => {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    db.prepare('DELETE FROM chapters WHERE id = ?').run(chapterId);
    logAction(admin.id, 'CHAPTER_DELETED', 'chapter', chapterId, {});
    sendJSON(res, 200, { ok: true });
  });

  // ------------------------------------------------------------ genres/tags
  router.get('/api/admin/genres', async (req, res) => {
    if (!requireAdmin(req, res)) return;
    sendJSON(res, 200, db.prepare('SELECT * FROM genres ORDER BY name').all());
  });
  router.post('/api/admin/genres', async (req, res, params, body) => {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    if (!body.name) return badRequest(res, 'name is required.');
    const gid = id();
    db.prepare('INSERT INTO genres (id, name, slug) VALUES (?,?,?)').run(gid, body.name, slugify(body.name));
    sendJSON(res, 201, db.prepare('SELECT * FROM genres WHERE id = ?').get(gid));
  });
  router.delete('/api/admin/genres/:id', async (req, res, { id: gid }) => {
    if (!requireAdmin(req, res)) return;
    db.prepare('DELETE FROM genres WHERE id = ?').run(gid);
    sendJSON(res, 200, { ok: true });
  });

  router.get('/api/admin/tags', async (req, res) => {
    if (!requireAdmin(req, res)) return;
    sendJSON(res, 200, db.prepare('SELECT * FROM tags ORDER BY name').all());
  });
  router.post('/api/admin/tags', async (req, res, params, body) => {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    if (!body.name) return badRequest(res, 'name is required.');
    const tid = id();
    db.prepare('INSERT INTO tags (id, name, slug) VALUES (?,?,?)').run(tid, body.name, slugify(body.name));
    sendJSON(res, 201, db.prepare('SELECT * FROM tags WHERE id = ?').get(tid));
  });
  router.delete('/api/admin/tags/:id', async (req, res, { id: tid }) => {
    if (!requireAdmin(req, res)) return;
    db.prepare('DELETE FROM tags WHERE id = ?').run(tid);
    sendJSON(res, 200, { ok: true });
  });

  // ------------------------------------------------------------- products
  router.get('/api/admin/products', async (req, res) => {
    if (!requireAdmin(req, res)) return;
    sendJSON(res, 200, db.prepare('SELECT * FROM products ORDER BY price_cents').all());
  });
  router.patch('/api/admin/products/:id', async (req, res, { id: pid }, body) => {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    const sets = ["updated_at = datetime('now')"];
    const args = [];
    if (body.name !== undefined) { sets.push('name = ?'); args.push(body.name); }
    if (body.description !== undefined) { sets.push('description = ?'); args.push(body.description); }
    if (body.priceCents !== undefined) { sets.push('price_cents = ?'); args.push(body.priceCents); }
    if (body.currency !== undefined) { sets.push('currency = ?'); args.push(body.currency); }
    if (body.active !== undefined) { sets.push('active = ?'); args.push(body.active ? 1 : 0); }
    args.push(pid);
    db.prepare(`UPDATE products SET ${sets.join(', ')} WHERE id = ?`).run(...args);
    logAction(admin.id, 'PRICE_CHANGED', 'product', pid, body);
    sendJSON(res, 200, db.prepare('SELECT * FROM products WHERE id = ?').get(pid));
  });

  // --------------------------------------------------------------- orders
  router.get('/api/admin/orders', async (req, res) => {
    if (!requireAdmin(req, res)) return;
    sendJSON(
      res,
      200,
      db
        .prepare(
          `SELECT o.*, u.name as user_name, u.email as user_email, p.name as product_name, b.title as book_title
           FROM orders o JOIN users u ON u.id=o.user_id JOIN products p ON p.id=o.product_id
           LEFT JOIN books b ON b.id = o.book_id ORDER BY o.created_at DESC LIMIT 200`
        )
        .all()
    );
  });

  // ----------------------------------------------------------- entitlements
  router.get('/api/admin/entitlements', async (req, res) => {
    if (!requireAdmin(req, res)) return;
    sendJSON(
      res,
      200,
      db
        .prepare(
          `SELECT e.*, u.name as user_name, p.name as product_name, b.title as book_title
           FROM entitlements e JOIN users u ON u.id=e.user_id JOIN products p ON p.id=e.product_id
           LEFT JOIN books b ON b.id = e.book_id ORDER BY e.created_at DESC LIMIT 200`
        )
        .all()
    );
  });

  router.post('/api/admin/entitlements/grant', async (req, res, params, body) => {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    if (!body.userId || !body.type) return badRequest(res, 'userId and type are required.');
    const product = db.prepare('SELECT * FROM products WHERE type = ?').get(body.type);
    if (!product) return badRequest(res, 'Unknown entitlement type.');
    const access = require('../lib/access');
    const entId = access.grantEntitlement(body.userId, null, product.id, body.type);
    logAction(admin.id, 'ENTITLEMENT_GRANTED', 'entitlement', entId, { userId: body.userId, type: body.type });
    sendJSON(res, 201, db.prepare('SELECT * FROM entitlements WHERE id = ?').get(entId));
  });

  router.post('/api/admin/entitlements/:id/revoke', async (req, res, { id: entId }) => {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    db.prepare(`UPDATE entitlements SET status='REVOKED' WHERE id=?`).run(entId);
    logAction(admin.id, 'ENTITLEMENT_REVOKED', 'entitlement', entId, {});
    sendJSON(res, 200, { ok: true });
  });

  // ------------------------------------------------------------------- vip
  router.get('/api/admin/vip', async (req, res) => {
    if (!requireAdmin(req, res)) return;
    sendJSON(
      res,
      200,
      db
        .prepare(
          `SELECT v.*, u.name as user_name, u.email as user_email FROM vip_memberships v JOIN users u ON u.id=v.user_id ORDER BY v.created_at DESC`
        )
        .all()
    );
  });

  // --------------------------------------------------------------- readers
  router.get('/api/admin/readers', async (req, res, params, body, query) => {
    if (!requireAdmin(req, res)) return;
    let sql = `SELECT * FROM users WHERE role = 'READER'`;
    const args = [];
    if (query.search) {
      sql += ' AND (name LIKE ? OR email LIKE ? OR id = ?)';
      const like = `%${query.search}%`;
      args.push(like, like, query.search);
    }
    sql += ' ORDER BY created_at DESC LIMIT 200';
    sendJSON(res, 200, db.prepare(sql).all(...args).map(publicUser));
  });

  router.get('/api/admin/readers/:id', async (req, res, { id: readerId }) => {
    if (!requireAdmin(req, res)) return;
    const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(readerId);
    if (!user) return notFound(res, 'Reader not found.');
    const library = db
      .prepare(`SELECT b.title, li.source, li.added_at FROM library_items li JOIN books b ON b.id=li.book_id WHERE li.user_id=?`)
      .all(readerId);
    const orders = db
      .prepare(`SELECT o.*, p.name as product_name FROM orders o JOIN products p ON p.id=o.product_id WHERE o.user_id=? ORDER BY o.created_at DESC`)
      .all(readerId);
    const progress = db.prepare(`SELECT * FROM reading_progress WHERE user_id = ?`).all(readerId);
    const comments = db.prepare(`SELECT COUNT(*) c FROM comments WHERE user_id = ?`).get(readerId).c;
    const pdfDownloads = db.prepare(`SELECT COUNT(*) c FROM pdf_downloads WHERE user_id = ?`).get(readerId).c;
    const vip = require('../lib/access').isVip(readerId);
    sendJSON(res, 200, { user: publicUser(user), library, orders, progress, comments, pdfDownloads, vip });
  });

  router.post('/api/admin/readers/:id/suspend', async (req, res, { id: readerId }) => {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    db.prepare(`UPDATE users SET status='SUSPENDED' WHERE id=?`).run(readerId);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(readerId);
    logAction(admin.id, 'READER_SUSPENDED', 'user', readerId, {});
    sendJSON(res, 200, { ok: true });
  });

  router.post('/api/admin/readers/:id/restore', async (req, res, { id: readerId }) => {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    db.prepare(`UPDATE users SET status='ACTIVE' WHERE id=?`).run(readerId);
    logAction(admin.id, 'READER_RESTORED', 'user', readerId, {});
    sendJSON(res, 200, { ok: true });
  });

  // -------------------------------------------------------------- comments
  router.get('/api/admin/comments', async (req, res) => {
    if (!requireAdmin(req, res)) return;
    sendJSON(
      res,
      200,
      db
        .prepare(
          `SELECT c.*, u.name as user_name, b.title as book_title FROM comments c
           JOIN users u ON u.id=c.user_id JOIN books b ON b.id=c.book_id ORDER BY c.created_at DESC LIMIT 300`
        )
        .all()
    );
  });
  router.post('/api/admin/comments/:id/hide', async (req, res, { id: cid }) => {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    db.prepare(`UPDATE comments SET status='HIDDEN' WHERE id=?`).run(cid);
    logAction(admin.id, 'COMMENT_HIDDEN', 'comment', cid, {});
    sendJSON(res, 200, { ok: true });
  });
  router.post('/api/admin/comments/:id/restore', async (req, res, { id: cid }) => {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    db.prepare(`UPDATE comments SET status='VISIBLE' WHERE id=?`).run(cid);
    logAction(admin.id, 'COMMENT_RESTORED', 'comment', cid, {});
    sendJSON(res, 200, { ok: true });
  });
  router.delete('/api/admin/comments/:id', async (req, res, { id: cid }) => {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    db.prepare(`UPDATE comments SET status='DELETED' WHERE id=?`).run(cid);
    logAction(admin.id, 'COMMENT_DELETED', 'comment', cid, {});
    sendJSON(res, 200, { ok: true });
  });

  // --------------------------------------------------------------- reports
  router.get('/api/admin/reports', async (req, res) => {
    if (!requireAdmin(req, res)) return;
    sendJSON(
      res,
      200,
      db
        .prepare(
          `SELECT r.*, c.body as comment_body, c.book_id, c.chapter_id, u.name as reporter_name, b.title as book_title
           FROM comment_reports r JOIN comments c ON c.id=r.comment_id JOIN users u ON u.id=r.reporter_id
           JOIN books b ON b.id = c.book_id ORDER BY r.created_at DESC`
        )
        .all()
    );
  });
  router.post('/api/admin/reports/:id/dismiss', async (req, res, { id: rid }) => {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    db.prepare(`UPDATE comment_reports SET status='DISMISSED' WHERE id=?`).run(rid);
    logAction(admin.id, 'REPORT_DISMISSED', 'report', rid, {});
    sendJSON(res, 200, { ok: true });
  });
  router.post('/api/admin/reports/:id/resolve', async (req, res, { id: rid }) => {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    const report = db.prepare('SELECT * FROM comment_reports WHERE id = ?').get(rid);
    if (report) db.prepare(`UPDATE comments SET status='HIDDEN' WHERE id=?`).run(report.comment_id);
    db.prepare(`UPDATE comment_reports SET status='RESOLVED' WHERE id=?`).run(rid);
    logAction(admin.id, 'REPORT_RESOLVED', 'report', rid, {});
    sendJSON(res, 200, { ok: true });
  });

  // ---------------------------------------------------------- translations
  router.get('/api/admin/translations', async (req, res) => {
    if (!requireAdmin(req, res)) return;
    sendJSON(res, 200, db.prepare('SELECT * FROM translations ORDER BY created_at DESC LIMIT 200').all());
  });

  // -------------------------------------------------------------- audit log
  router.get('/api/admin/audit', async (req, res) => {
    if (!requireAdmin(req, res)) return;
    sendJSON(
      res,
      200,
      db
        .prepare(
          `SELECT a.*, u.name as admin_name FROM audit_logs a LEFT JOIN users u ON u.id=a.admin_id ORDER BY a.created_at DESC LIMIT 300`
        )
        .all()
    );
  });

  // -------------------------------------------------------------- policies
  const POLICY_DEFS = {
    terms: 'Terms of Service',
    privacy: 'Privacy Policy',
    cookies: 'Cookie Policy',
    copyright: 'Copyright / DMCA Policy',
    'content-guidelines': 'Content Guidelines',
    refunds: 'Refund Policy',
  };
  router.get('/api/admin/policies', async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const rows = db.prepare('SELECT * FROM policies').all();
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
    sendJSON(res, 200, Object.entries(POLICY_DEFS).map(([key, title]) => byKey[key] || { key, title, content: '', status: 'DRAFT', updated_at: null }));
  });
  router.get('/api/admin/policies/:key', async (req, res, { key }) => {
    if (!requireAdmin(req, res)) return;
    if (!POLICY_DEFS[key]) return notFound(res, 'Unknown policy.');
    const row = db.prepare('SELECT * FROM policies WHERE key = ?').get(key);
    sendJSON(res, 200, row || { key, title: POLICY_DEFS[key], content: '', status: 'DRAFT', updated_at: null });
  });
  router.patch('/api/admin/policies/:key', async (req, res, { key }, body) => {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    if (!POLICY_DEFS[key]) return notFound(res, 'Unknown policy.');
    const existing = db.prepare('SELECT * FROM policies WHERE key = ?').get(key);
    const content = body.content !== undefined ? body.content : (existing ? existing.content : '');
    const title = body.title !== undefined ? body.title : (existing ? existing.title : POLICY_DEFS[key]);
    if (existing) {
      db.prepare(`UPDATE policies SET title=?, content=?, updated_at=datetime('now') WHERE key=?`).run(title, content, key);
    } else {
      db.prepare(`INSERT INTO policies (key, title, content, status) VALUES (?,?,?, 'DRAFT')`).run(key, title, content);
    }
    logAction(admin.id, 'POLICY_EDITED', 'policy', key, {});
    sendJSON(res, 200, db.prepare('SELECT * FROM policies WHERE key = ?').get(key));
  });
  router.post('/api/admin/policies/:key/publish', async (req, res, { key }) => {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    if (!POLICY_DEFS[key]) return notFound(res, 'Unknown policy.');
    db.prepare(`UPDATE policies SET status='PUBLISHED', updated_at=datetime('now') WHERE key=?`).run(key);
    logAction(admin.id, 'POLICY_PUBLISHED', 'policy', key, {});
    sendJSON(res, 200, db.prepare('SELECT * FROM policies WHERE key = ?').get(key));
  });
  router.post('/api/admin/policies/:key/unpublish', async (req, res, { key }) => {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    db.prepare(`UPDATE policies SET status='DRAFT', updated_at=datetime('now') WHERE key=?`).run(key);
    logAction(admin.id, 'POLICY_UNPUBLISHED', 'policy', key, {});
    sendJSON(res, 200, db.prepare('SELECT * FROM policies WHERE key = ?').get(key));
  });

  // -------------------------------------------------------- support messages
  router.get('/api/admin/support-messages', async (req, res) => {
    if (!requireAdmin(req, res)) return;
    sendJSON(res, 200, db.prepare('SELECT * FROM support_messages ORDER BY created_at DESC LIMIT 200').all());
  });
  router.post('/api/admin/support-messages/:id/close', async (req, res, { id: msgId }) => {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    db.prepare(`UPDATE support_messages SET status='CLOSED' WHERE id=?`).run(msgId);
    sendJSON(res, 200, { ok: true });
  });

  // -------------------------------------------------------------- media ----
  router.get('/api/admin/media', async (req, res) => {
    if (!requireAdmin(req, res)) return;
    sendJSON(
      res,
      200,
      db
        .prepare(
          `SELECT m.*, b.title as book_title FROM media m LEFT JOIN books b ON b.id = m.book_id ORDER BY m.uploaded_at DESC`
        )
        .all()
    );
  });

  router.delete('/api/admin/media/:id', async (req, res, { id: mediaId }) => {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    const media = db.prepare('SELECT * FROM media WHERE id = ?').get(mediaId);
    if (!media) return notFound(res, 'Media not found.');
    // Guard: never leave a book with a broken cover reference.
    const inUse = db
      .prepare(`SELECT id, title FROM books WHERE cover_image = ? OR featured_image = ? OR social_image = ? OR pdf_url = ?`)
      .get(`/uploads/${media.filename}`, `/uploads/${media.filename}`, `/uploads/${media.filename}`, `private:${media.filename}`);
    if (inUse && !req_query_force(req)) {
      return sendJSON(res, 409, {
        error: `This image is currently used as the cover for "${inUse.title}". Replace that book's cover first, or confirm to delete anyway.`,
        bookId: inUse.id,
        bookTitle: inUse.title,
      });
    }
    try { fs.unlinkSync(path.join(UPLOAD_DIR, media.filename)); } catch (e) { /* file already gone */ }
    db.prepare('DELETE FROM media WHERE id = ?').run(mediaId);
    logAction(admin.id, 'MEDIA_DELETED', 'media', mediaId, { filename: media.filename });
    sendJSON(res, 200, { ok: true });
  });
  function req_query_force(req) {
    return new URL(req.url, 'http://x').searchParams.get('force') === '1';
  }

  // Small dependency-free upload: client base64-encodes the file and posts
  // JSON. Fine for cover art / promo images at CMS scale; swap for direct-to-
  // object-storage (S3/R2) presigned uploads before handling large PDFs in
  // production.
  router.post('/api/admin/media/upload', async (req, res, params, body) => {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    if (!body.filename || !body.dataBase64 || !body.type) {
      return badRequest(res, 'filename, type, and dataBase64 are required.');
    }
    const buf = Buffer.from(body.dataBase64, 'base64');
    if (buf.length > 8 * 1024 * 1024) return badRequest(res, 'File too large (8MB limit for this demo uploader).');
    const mediaId = id();
    const ext = path.extname(body.filename) || '';
    const storedName = `${mediaId}${ext}`;
    fs.writeFileSync(path.join(UPLOAD_DIR, storedName), buf);
    db.prepare(
      `INSERT INTO media (id, filename, original_name, type, size_bytes, book_id) VALUES (?,?,?,?,?,?)`
    ).run(mediaId, storedName, body.filename, body.type, buf.length, body.bookId || null);
    logAction(admin.id, 'MEDIA_UPLOADED', 'media', mediaId, { type: body.type, bookId: body.bookId || null });
    sendJSON(res, 201, { id: mediaId, url: `/uploads/${storedName}` });
  });
}

module.exports = register;

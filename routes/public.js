'use strict';
const db = require('../lib/db');
const { id, sendJSON, badRequest, notFound, forbidden } = require('../lib/util');
const { getCurrentUser, requireAuth } = require('../lib/auth');
const access = require('../lib/access');
const stats = require('../lib/stats');
const { translate } = require('../lib/translate');

function genresForBook(bookId) {
  return db
    .prepare(`SELECT g.id, g.name, g.slug FROM genres g JOIN book_genres bg ON bg.genre_id = g.id WHERE bg.book_id = ?`)
    .all(bookId);
}
function tagsForBook(bookId) {
  return db
    .prepare(`SELECT t.id, t.name, t.slug FROM tags t JOIN book_tags bt ON bt.tag_id = t.id WHERE bt.book_id = ?`)
    .all(bookId);
}

function toCard(book, userId) {
  const metrics = stats.bookMetrics(book.id);
  return {
    id: book.id,
    slug: book.slug,
    title: book.title,
    author: book.author,
    shortDescription: book.short_description,
    cover: book.cover_image,
    chapters: db.prepare("SELECT COUNT(*) c FROM chapters WHERE book_id = ? AND status='PUBLISHED'").get(book.id).c,
    genres: genresForBook(book.id).map((g) => g.name),
    tags: tagsForBook(book.id).map((t) => t.name),
    accessTiers: JSON.parse(book.access_tiers || '[]'),
    vipEligible: !!book.vip_eligible,
    vipExclusive: !!book.vip_exclusive,
    pdfEligible: !!book.pdf_eligible,
    featured: !!book.featured,
    trending: !!book.trending,
    bestSeller: !!book.best_seller,
    newRelease: !!book.new_release,
    rating: metrics.rating,
    reviewCount: metrics.reviewCount,
    bookmarked: userId ? !!db.prepare('SELECT 1 FROM bookmarks WHERE user_id=? AND book_id=?').get(userId, book.id) : false,
  };
}

function toDetail(book, userId) {
  const card = toCard(book, userId);
  const metrics = stats.bookMetrics(book.id);
  return {
    ...card,
    subtitle: book.subtitle,
    synopsis: book.synopsis,
    originalLanguage: book.original_language,
    freePreviewChapters: book.free_preview_chapters,
    commentCount: metrics.commentCount,
    readers: metrics.readers,
    inLibrary: userId ? access.hasLibraryAccess(userId, book.id) : false,
    pdfAvailable: !!(book.pdf_enabled && book.pdf_url),
    canDownloadPdf: access.canDownloadPdf(userId, book).allowed,
    publishedAt: book.published_at,
    updatedAt: book.updated_at,
  };
}

function register(router) {
  // ---- stats -------------------------------------------------------------
  router.get('/api/stats/homepage', async (req, res) => {
    sendJSON(res, 200, stats.homepageStats());
  });

  // ---- genres / tags -------------------------------------------------------
  router.get('/api/genres', async (req, res) => {
    sendJSON(res, 200, db.prepare('SELECT * FROM genres ORDER BY name').all());
  });
  router.get('/api/tags', async (req, res) => {
    sendJSON(res, 200, db.prepare('SELECT * FROM tags ORDER BY name').all());
  });

  // ---- products ------------------------------------------------------------
  router.get('/api/products', async (req, res) => {
    sendJSON(res, 200, db.prepare('SELECT * FROM products WHERE active = 1 ORDER BY price_cents').all());
  });

  // ---- books ---------------------------------------------------------------
  router.get('/api/books', async (req, res, params, body, query) => {
    const user = getCurrentUser(req);

    // trending / newRelease / bestSeller are computed signals (see
    // lib/stats.js), not simple flag filters — handle them as dedicated,
    // real-data-backed queries rather than a WHERE clause on a static column.
    if (query.trending === '1' && !query.genre && !query.tag && !query.q && !query.tier) {
      return sendJSON(res, 200, stats.getTrendingBooks(query.limit ? Number(query.limit) : 20).map((b) => toCard(b, user && user.id)));
    }
    if (query.newRelease === '1' && !query.genre && !query.tag && !query.q && !query.tier) {
      return sendJSON(res, 200, stats.getNewReleases(query.limit ? Number(query.limit) : 20).map((b) => toCard(b, user && user.id)));
    }
    if (query.bestSeller === '1' && !query.genre && !query.tag && !query.q && !query.tier) {
      return sendJSON(res, 200, stats.getBestSellers(query.limit ? Number(query.limit) : 20).map((b) => toCard(b, user && user.id)));
    }

    let sql = `SELECT * FROM books WHERE status = 'PUBLISHED'`;
    const args = [];
    if (query.tier) {
      sql += ` AND access_tiers LIKE ?`;
      args.push(`%"${query.tier}"%`);
    }
    if (query.vip === '1') sql += ` AND (vip_eligible = 1 OR vip_exclusive = 1)`;
    if (query.vipExclusive === '1') sql += ` AND vip_exclusive = 1`;
    if (query.featured === '1') sql += ` AND featured = 1`; // editorial-only signal, distinct from the above
    if (query.genre) {
      sql += ` AND id IN (SELECT book_id FROM book_genres bg JOIN genres g ON g.id=bg.genre_id WHERE g.slug = ?)`;
      args.push(query.genre);
    }
    if (query.tag) {
      sql += ` AND id IN (SELECT book_id FROM book_tags bt JOIN tags t ON t.id=bt.tag_id WHERE t.slug = ?)`;
      args.push(query.tag);
    }
    if (query.q) {
      sql += ` AND (title LIKE ? OR author LIKE ? OR synopsis LIKE ?)`;
      const like = `%${query.q}%`;
      args.push(like, like, like);
    }
    sql += ` ORDER BY published_at DESC`;
    const books = db.prepare(sql).all(...args);
    sendJSON(res, 200, books.map((b) => toCard(b, user && user.id)));
  });

  router.get('/api/books/:slug', async (req, res, { slug }) => {
    const user = getCurrentUser(req);
    const book = db.prepare('SELECT * FROM books WHERE slug = ?').get(slug);
    if (!book || (book.status !== 'PUBLISHED' && !(user && user.role === 'ADMIN'))) return notFound(res, 'Book not found.');
    sendJSON(res, 200, toDetail(book, user && user.id));
  });

  router.get('/api/books/:id/chapters', async (req, res, { id: bookId }) => {
    const user = getCurrentUser(req);
    const book = db.prepare('SELECT * FROM books WHERE id = ? OR slug = ?').get(bookId, bookId);
    if (!book) return notFound(res, 'Book not found.');
    const chapters = db
      .prepare(`SELECT id, number, title, is_preview, published_at FROM chapters WHERE book_id = ? AND status='PUBLISHED' ORDER BY order_index`)
      .all(book.id);
    const progress = user
      ? db.prepare('SELECT * FROM reading_progress WHERE user_id = ? AND book_id = ?').get(user.id, book.id)
      : null;
    sendJSON(
      res,
      200,
      chapters.map((c) => {
        const gate = access.canReadChapter(user && user.id, book, c.number);
        return { id: c.id, number: c.number, title: c.title, locked: !gate.allowed, unlockReason: gate.allowed ? null : gate.reason };
      })
    );
    void progress;
  });

  router.get('/api/books/:id/chapters/:number', async (req, res, { id: bookId, number }) => {
    const user = getCurrentUser(req);
    const book = db.prepare('SELECT * FROM books WHERE id = ? OR slug = ?').get(bookId, bookId);
    if (!book) return notFound(res, 'Book not found.');
    const chapter = db
      .prepare(`SELECT * FROM chapters WHERE book_id = ? AND number = ? AND status='PUBLISHED'`)
      .get(book.id, Number(number));
    if (!chapter) return notFound(res, 'Chapter not found.');
    const gate = access.canReadChapter(user && user.id, book, chapter.number);
    if (!gate.allowed) return forbidden(res, gate.reason);
    const totalChapters = db.prepare(`SELECT COUNT(*) c FROM chapters WHERE book_id=? AND status='PUBLISHED'`).get(book.id).c;
    sendJSON(res, 200, {
      id: chapter.id,
      number: chapter.number,
      title: chapter.title,
      content: chapter.content,
      voiceEnabled: !!chapter.voice_enabled,
      audioStatus: chapter.audio_status,
      audioSource: chapter.audio_source,
      totalChapters,
      bookId: book.id,
      bookTitle: book.title,
    });
  });

  // ---- PDF download (authorized, never a public URL) ----------------------
  router.get('/api/books/:id/pdf', async (req, res, { id: bookId }) => {
    const user = getCurrentUser(req);
    const book = db.prepare('SELECT * FROM books WHERE id = ? OR slug = ?').get(bookId, bookId);
    if (!book) return notFound(res, 'Book not found.');
    const gate = access.canDownloadPdf(user && user.id, book);
    if (!gate.allowed) {
      // 401 if the problem is "not signed in", 403 if signed in but not entitled.
      return user ? forbidden(res, gate.reason) : require('../lib/util').unauthorized(res, gate.reason);
    }
    const filename = book.pdf_url.replace('private:', '');
    const filePath = require('path').join(__dirname, '..', 'private-uploads', filename);
    const fs = require('fs');
    if (!fs.existsSync(filePath)) return notFound(res, 'PDF file missing.');
    db.prepare(`INSERT INTO pdf_downloads (id, user_id, book_id) VALUES (?,?,?)`).run(id(), user.id, book.id);
    const data = fs.readFileSync(filePath);
    res.writeHead(200, {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${(book.pdf_filename || (book.title + '.pdf')).replace(/"/g, '')}"`,
      'Content-Length': data.length,
      'Cache-Control': 'private, no-store',
    });
    res.end(data);
  });

  // ---- comments --------------------------------------------------------------
  router.get('/api/comments', async (req, res, params, body, query) => {
    if (!query.bookId) return badRequest(res, 'bookId is required.');
    const rows = db
      .prepare(
        `SELECT c.*, u.name as user_name, u.avatar_url as user_avatar FROM comments c JOIN users u ON u.id = c.user_id
         WHERE c.book_id = ? AND c.status = 'VISIBLE' ${query.chapterId ? 'AND c.chapter_id = ?' : ''}
         ORDER BY c.created_at DESC`
      )
      .all(...(query.chapterId ? [query.bookId, query.chapterId] : [query.bookId]));
    sendJSON(res, 200, rows);
  });

  router.post('/api/comments', async (req, res, params, body) => {
    const user = requireAuth(req, res);
    if (!user) return;
    if (!body.bookId || !body.body || !body.body.trim()) return badRequest(res, 'bookId and body are required.');
    const commentId = id();
    db.prepare(
      `INSERT INTO comments (id, book_id, chapter_id, user_id, parent_id, body) VALUES (?,?,?,?,?,?)`
    ).run(commentId, body.bookId, body.chapterId || null, user.id, body.parentId || null, body.body.trim());
    sendJSON(res, 201, db.prepare('SELECT * FROM comments WHERE id = ?').get(commentId));
  });

  router.post('/api/comments/:id/like', async (req, res, { id: commentId }) => {
    const user = requireAuth(req, res);
    if (!user) return;
    db.prepare('UPDATE comments SET likes = likes + 1 WHERE id = ?').run(commentId);
    sendJSON(res, 200, { ok: true });
  });

  router.post('/api/comments/:id/report', async (req, res, { id: commentId }, body) => {
    const user = requireAuth(req, res);
    if (!user) return;
    const comment = db.prepare('SELECT * FROM comments WHERE id = ?').get(commentId);
    if (!comment) return notFound(res, 'Comment not found.');
    db.prepare(
      `INSERT INTO comment_reports (id, comment_id, reporter_id, reason) VALUES (?,?,?,?)`
    ).run(id(), commentId, user.id, body.reason || null);
    sendJSON(res, 201, { ok: true });
  });

  // ---- reviews --------------------------------------------------------------
  router.get('/api/reviews', async (req, res, params, body, query) => {
    if (!query.bookId) return badRequest(res, 'bookId is required.');
    sendJSON(
      res,
      200,
      db
        .prepare(
          `SELECT r.*, u.name as user_name, u.avatar_url as user_avatar FROM reviews r JOIN users u ON u.id = r.user_id
           WHERE r.book_id = ? AND r.status = 'APPROVED' ORDER BY r.created_at DESC`
        )
        .all(query.bookId)
    );
  });

  router.post('/api/reviews', async (req, res, params, body) => {
    const user = requireAuth(req, res);
    if (!user) return;
    const rating = Number(body.rating);
    if (!body.bookId || !rating || rating < 1 || rating > 5) return badRequest(res, 'bookId and a rating (1-5) are required.');
    const existing = db.prepare('SELECT id FROM reviews WHERE book_id = ? AND user_id = ?').get(body.bookId, user.id);
    if (existing) {
      db.prepare('UPDATE reviews SET rating=?, body=? WHERE id=?').run(rating, body.body || null, existing.id);
    } else {
      db.prepare(
        `INSERT INTO reviews (id, book_id, user_id, rating, body) VALUES (?,?,?,?,?)`
      ).run(id(), body.bookId, user.id, rating, body.body || null);
    }
    sendJSON(res, 200, { ok: true });
  });

  // ---- policies (public read of PUBLISHED only) ----------------------------
  router.get('/api/policies/:key', async (req, res, { key }) => {
    const policy = db.prepare(`SELECT * FROM policies WHERE key = ? AND status = 'PUBLISHED'`).get(key);
    if (!policy) return notFound(res, 'This policy is not currently published.');
    sendJSON(res, 200, policy);
  });

  // ---- support / contact ----------------------------------------------------
  router.post('/api/support/contact', async (req, res, params, body) => {
    const user = getCurrentUser(req);
    const name = (body.name || (user && user.name) || '').trim();
    const email = (body.email || (user && user.email) || '').trim();
    const message = (body.message || '').trim();
    if (!name || !email || !message) return badRequest(res, 'Name, email, and message are required.');
    db.prepare(
      `INSERT INTO support_messages (id, name, email, topic, message, user_id) VALUES (?,?,?,?,?,?)`
    ).run(id(), name, email, body.topic || null, message.slice(0, 2000), user ? user.id : null);
    sendJSON(res, 201, { ok: true });
  });

  // ---- translation (best-effort; see lib/translate.js) --------------------
  router.post('/api/translate', async (req, res, params, body) => {
    if (!body.contentType || !body.contentId || !body.language || !body.text) {
      return badRequest(res, 'contentType, contentId, language, and text are required.');
    }
    const result = await translate(body.contentType, body.contentId, body.language, body.text);
    if (result.status !== 'READY') {
      return sendJSON(res, 200, {
        status: 'UNAVAILABLE',
        message: 'Translation isn\'t connected in this environment yet. Configure TRANSLATE_API_KEY to enable it.',
        original: body.text,
      });
    }
    sendJSON(res, 200, { status: 'READY', translated: result.translated_text });
  });
}

module.exports = register;

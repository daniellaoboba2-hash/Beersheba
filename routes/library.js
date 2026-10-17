'use strict';
const fs = require('fs');
const path = require('path');
const db = require('../lib/db');
const { id, sendJSON, badRequest, notFound, forbidden, sanitizePlainText, isValidEmail, isValidUsername, parseCookies } = require('../lib/util');
const { requireAuth, publicUser, verifyPassword, hashPassword, SESSION_COOKIE } = require('../lib/auth');
const { logAction } = require('../lib/audit');
const access = require('../lib/access');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const BIO_MAX_LENGTH = 280;

function bookSummary(bookId) {
  const b = db.prepare('SELECT id, slug, title, author, cover_image FROM books WHERE id = ?').get(bookId);
  if (!b) return null;
  const totalChapters = db.prepare(`SELECT COUNT(*) c FROM chapters WHERE book_id=? AND status='PUBLISHED'`).get(bookId).c;
  return { id: b.id, slug: b.slug, title: b.title, author: b.author, cover: b.cover_image, totalChapters };
}

function register(router) {
  router.get('/api/me', async (req, res) => {
    const user = requireAuth(req, res);
    if (!user) return;
    const vip = access.isVip(user.id);
    const entitlements = db.prepare('SELECT * FROM entitlements WHERE user_id = ? ORDER BY created_at DESC').all(user.id);
    sendJSON(res, 200, { user: publicUser(user), vip, entitlements });
  });

  router.patch('/api/me/settings', async (req, res, params, body) => {
    const user = requireAuth(req, res);
    if (!user) return;
    const current = user.reader_settings ? JSON.parse(user.reader_settings) : {};
    const merged = { ...current, ...(body.readerSettings || {}) };
    db.prepare('UPDATE users SET reader_settings = ?, updated_at = datetime(\'now\') WHERE id = ?').run(
      JSON.stringify(merged),
      user.id
    );
    if (body.preferredLanguage) {
      db.prepare('UPDATE users SET preferred_language = ? WHERE id = ?').run(body.preferredLanguage, user.id);
    }
    sendJSON(res, 200, { readerSettings: merged });
  });

  /* ==========================================================
     PROFILE — editable fields, whitelisted server-side. Role,
     status, entitlements, VIP, and purchase records are never
     accepted here regardless of what a client sends — every
     mutation below operates only on requireAuth()'s own user.id,
     never on a client-supplied user id, so Reader A can never
     touch Reader B's account by editing a request.
     ========================================================== */
  router.patch('/api/me/profile', async (req, res, params, body) => {
    const user = requireAuth(req, res);
    if (!user) return;
    const sets = ["updated_at = datetime('now')"];
    const args = [];

    if (body.name !== undefined) {
      const name = sanitizePlainText(body.name, 80);
      if (!name) return badRequest(res, 'Display name cannot be empty.');
      sets.push('name = ?'); args.push(name);
    }
    if (body.bio !== undefined) {
      sets.push('bio = ?'); args.push(sanitizePlainText(body.bio, BIO_MAX_LENGTH));
    }
    if (body.preferredLanguage !== undefined) {
      sets.push('preferred_language = ?'); args.push(sanitizePlainText(body.preferredLanguage, 40));
    }
    if (sets.length === 1) return badRequest(res, 'Nothing to update.');
    args.push(user.id);
    db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...args);
    sendJSON(res, 200, { user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(user.id)) });
  });

  router.post('/api/me/username', async (req, res, params, body) => {
    const user = requireAuth(req, res);
    if (!user) return;
    const username = (body.username || '').trim();
    if (!isValidUsername(username)) {
      return badRequest(res, 'Usernames must be 3-20 characters: letters, numbers, and underscores only.');
    }
    const existing = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(username, user.id);
    if (existing) return badRequest(res, 'That username is already taken.');
    db.prepare("UPDATE users SET username = ?, updated_at = datetime('now') WHERE id = ?").run(username, user.id);
    sendJSON(res, 200, { username });
  });

  router.post('/api/me/email', async (req, res, params, body) => {
    const user = requireAuth(req, res);
    if (!user) return;
    const { newEmail, currentPassword } = body;
    if (!isValidEmail(newEmail)) return badRequest(res, 'Please enter a valid email address.');
    if (!currentPassword || !verifyPassword(currentPassword, user.password_hash)) {
      return badRequest(res, 'Current password is incorrect.');
    }
    const normalized = newEmail.trim().toLowerCase();
    const existing = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(normalized, user.id);
    if (existing) return badRequest(res, 'That email is already in use by another account.');
    // Production note: this should send a verification link to newEmail and
    // only apply the change once it's confirmed, rather than updating
    // immediately off a password check. Flagged here rather than silently
    // shipped as if it were the real flow.
    db.prepare("UPDATE users SET email = ?, updated_at = datetime('now') WHERE id = ?").run(normalized, user.id);
    logAction(null, 'READER_EMAIL_CHANGED', 'user', user.id, {});
    sendJSON(res, 200, { email: normalized, dev: true, note: 'Email updated immediately in this prototype. Production should require verifying the new address first.' });
  });

  router.post('/api/me/password', async (req, res, params, body) => {
    const user = requireAuth(req, res);
    if (!user) return;
    const { currentPassword, newPassword } = body;
    if (!currentPassword || !verifyPassword(currentPassword, user.password_hash)) {
      return badRequest(res, 'Current password is incorrect.');
    }
    if (!newPassword || newPassword.length < 8) return badRequest(res, 'New password must be at least 8 characters.');
    db.prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?").run(hashPassword(newPassword), user.id);
    // Sign the reader out everywhere else for safety, but keep the session
    // that just made this change (identified by the caller's own cookie —
    // simplest correct approach here is to drop every OTHER session).
    const cookies = parseCookies(req);
    const currentToken = cookies[SESSION_COOKIE];
    db.prepare('DELETE FROM sessions WHERE user_id = ? AND token != ?').run(user.id, currentToken || '');
    sendJSON(res, 200, { ok: true });
  });

  // Avatar upload reuses the exact same media-storage approach as book
  // covers (see routes/admin.js) — one MediaService-shaped path for every
  // image type, not a parallel upload system for avatars.
  router.post('/api/me/avatar', async (req, res, params, body) => {
    const user = requireAuth(req, res);
    if (!user) return;
    if (!body.filename || !body.dataBase64) return badRequest(res, 'filename and dataBase64 are required.');
    const allowedExt = ['.jpg', '.jpeg', '.png', '.webp'];
    const ext = path.extname(body.filename).toLowerCase();
    if (!allowedExt.includes(ext)) return badRequest(res, 'Please upload a JPG, PNG, or WEBP image. Existing photo kept.');
    const buf = Buffer.from(body.dataBase64, 'base64');
    if (buf.length > 5 * 1024 * 1024) return badRequest(res, 'Image is larger than 5MB. Existing photo kept.');

    const mediaId = id();
    const storedName = `${mediaId}${ext}`;
    try {
      fs.writeFileSync(path.join(UPLOAD_DIR, storedName), buf);
    } catch (e) {
      return sendJSON(res, 500, { error: 'Upload failed. Existing photo kept.' });
    }
    db.prepare(
      `INSERT INTO media (id, filename, original_name, type, size_bytes, user_id) VALUES (?,?,?,?,?,?)`
    ).run(mediaId, storedName, body.filename, 'AVATAR', buf.length, user.id);

    const oldAvatar = user.avatar_url;
    db.prepare("UPDATE users SET avatar_url = ?, updated_at = datetime('now') WHERE id = ?").run(`/uploads/${storedName}`, user.id);
    // Best-effort cleanup of the previous avatar file so uploads don't pile up.
    if (oldAvatar && oldAvatar.startsWith('/uploads/')) {
      try { fs.unlinkSync(path.join(UPLOAD_DIR, path.basename(oldAvatar))); } catch (e) { /* already gone */ }
      db.prepare('DELETE FROM media WHERE filename = ? AND user_id = ?').run(path.basename(oldAvatar), user.id);
    }
    sendJSON(res, 200, { avatarUrl: `/uploads/${storedName}` });
  });

  router.delete('/api/me/avatar', async (req, res) => {
    const user = requireAuth(req, res);
    if (!user) return;
    if (user.avatar_url && user.avatar_url.startsWith('/uploads/')) {
      try { fs.unlinkSync(path.join(UPLOAD_DIR, path.basename(user.avatar_url))); } catch (e) { /* already gone */ }
      db.prepare('DELETE FROM media WHERE filename = ? AND user_id = ?').run(path.basename(user.avatar_url), user.id);
    }
    db.prepare("UPDATE users SET avatar_url = NULL, updated_at = datetime('now') WHERE id = ?").run(user.id);
    sendJSON(res, 200, { ok: true });
  });

  // Full account deletion is deliberately NOT implemented as a real delete
  // in this prototype — payment/audit/entitlement records must never
  // disappear just because a reader asks to close their account, and doing
  // that safely (anonymize vs. hard-delete, what happens to consumed
  // entitlements tied to orders, etc.) is a real product decision that
  // shouldn't be made silently inside a route handler. This endpoint exists
  // so the UI has something real to call, and it says so plainly.
  router.post('/api/me/delete-account', async (req, res) => {
    const user = requireAuth(req, res);
    if (!user) return;
    sendJSON(res, 501, {
      error: 'Account deletion is not implemented in this prototype.',
      explanation: 'Your library, reading progress, comments, reviews, purchase records, and VIP entitlement all remain exactly as they are. Production would need a deliberate policy here (e.g. anonymizing your profile while preserving financial/audit records for legal and accounting reasons) rather than a hard delete.',
    });
  });

  router.get('/api/library/bookmarks', async (req, res) => {
    const user = requireAuth(req, res);
    if (!user) return;
    const rows = db.prepare('SELECT book_id FROM bookmarks WHERE user_id = ?').all(user.id);
    sendJSON(res, 200, rows.map((r) => bookSummary(r.book_id)).filter(Boolean));
  });

  router.post('/api/library/bookmarks', async (req, res, params, body) => {
    const user = requireAuth(req, res);
    if (!user) return;
    if (!body.bookId) return badRequest(res, 'bookId is required.');
    try {
      db.prepare('INSERT INTO bookmarks (id, user_id, book_id) VALUES (?,?,?)').run(id(), user.id, body.bookId);
    } catch (e) {
      /* already bookmarked */
    }
    sendJSON(res, 200, { bookmarked: true });
  });

  router.delete('/api/library/bookmarks/:bookId', async (req, res, { bookId }) => {
    const user = requireAuth(req, res);
    if (!user) return;
    db.prepare('DELETE FROM bookmarks WHERE user_id = ? AND book_id = ?').run(user.id, bookId);
    sendJSON(res, 200, { bookmarked: false });
  });

  router.post('/api/library/progress', async (req, res, params, body) => {
    const user = requireAuth(req, res);
    if (!user) return;
    if (!body.bookId || !body.chapterNumber) return badRequest(res, 'bookId and chapterNumber are required.');
    const percent = Math.max(0, Math.min(100, Number(body.percent) || 0));
    db.prepare(
      `INSERT INTO reading_progress (user_id, book_id, chapter_number, percent, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'))
       ON CONFLICT(user_id, book_id) DO UPDATE SET chapter_number = excluded.chapter_number, percent = excluded.percent, updated_at = datetime('now')`
    ).run(user.id, body.bookId, Number(body.chapterNumber), percent);
    sendJSON(res, 200, { ok: true });
  });

  router.get('/api/library', async (req, res) => {
    const user = requireAuth(req, res);
    if (!user) return;

    const items = db
      .prepare(
        `SELECT li.*, b.title, b.author, b.cover_image, b.slug FROM library_items li
         JOIN books b ON b.id = li.book_id WHERE li.user_id = ? ORDER BY li.added_at DESC`
      )
      .all(user.id);

    const progressByBook = Object.fromEntries(
      db.prepare('SELECT * FROM reading_progress WHERE user_id = ?').all(user.id).map((p) => [p.book_id, p])
    );

    const enriched = items.map((it) => {
      const totalChapters = db.prepare(`SELECT COUNT(*) c FROM chapters WHERE book_id=? AND status='PUBLISHED'`).get(it.book_id).c;
      const progress = progressByBook[it.book_id];
      return {
        bookId: it.book_id,
        slug: it.slug,
        title: it.title,
        author: it.author,
        cover: it.cover_image,
        source: it.source,
        totalChapters,
        currentChapter: progress ? progress.chapter_number : 1,
        percent: progress ? progress.percent : 0,
        started: !!progress,
        completed: progress ? progress.percent >= 100 : false,
      };
    });

    const bookmarks = db.prepare('SELECT book_id FROM bookmarks WHERE user_id = ?').all(user.id).map((r) => bookSummary(r.book_id)).filter(Boolean);

    sendJSON(res, 200, {
      // Continue Reading = reading STATE (started, not finished) — access
      // source (purchased vs VIP) is a completely separate dimension, so a
      // book can legitimately appear here AND in Purchased/VIP Collection
      // at the same time. A book with no reading_progress row at all (never
      // opened) does not belong here yet.
      continueReading: enriched.filter((b) => b.started && !b.completed).sort((a, b) => (a.percent < b.percent ? 1 : -1)),
      purchased: enriched.filter((b) => b.source === 'ENTITLEMENT'),
      vipCollection: enriched.filter((b) => b.source === 'VIP'),
      completed: enriched.filter((b) => b.completed),
      bookmarks,
    });
  });
}

module.exports = register;

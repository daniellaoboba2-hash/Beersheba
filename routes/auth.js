'use strict';
const crypto = require('crypto');
const db = require('../lib/db');
const { id, sendJSON, badRequest } = require('../lib/util');
const {
  hashPassword, verifyPassword, createSession, destroySession, getCurrentUser, publicUser,
} = require('../lib/auth');

function register(router) {
  router.post('/api/auth/register', async (req, res, params, body) => {
    const name = (body.name || '').trim();
    const email = (body.email || '').trim().toLowerCase();
    const password = body.password || '';
    if (!name || !email || !password) return badRequest(res, 'Name, email, and password are required.');
    if (password.length < 8) return badRequest(res, 'Password must be at least 8 characters.');
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) return badRequest(res, 'An account with that email already exists.');

    const userId = id();
    db.prepare(
      `INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, ?, 'READER')`
    ).run(userId, name, email, hashPassword(password));
    createSession(res, userId);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    sendJSON(res, 201, { user: publicUser(user) });
  });

  router.post('/api/auth/login', async (req, res, params, body) => {
    const email = (body.email || '').trim().toLowerCase();
    const password = body.password || '';
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user || !verifyPassword(password, user.password_hash)) {
      return badRequest(res, 'Invalid email or password.');
    }
    if (user.status === 'SUSPENDED') return badRequest(res, 'This account has been suspended.');
    createSession(res, user.id);
    sendJSON(res, 200, { user: publicUser(user) });
  });

  router.post('/api/auth/logout', async (req, res) => {
    destroySession(req, res);
    sendJSON(res, 200, { ok: true });
  });

  router.get('/api/auth/session', async (req, res) => {
    const user = getCurrentUser(req);
    sendJSON(res, 200, { user: publicUser(user) });
  });

  // No outbound email in this environment, so the reset link is returned
  // directly in the API response (clearly marked DEV MODE) instead of being
  // emailed. Swap in a real mail provider in production and stop returning
  // `resetUrl` from this endpoint.
  router.post('/api/auth/forgot-password', async (req, res, params, body) => {
    const email = (body.email || '').trim().toLowerCase();
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    // Always respond the same way whether or not the email exists, so this
    // endpoint can't be used to enumerate registered accounts.
    if (!user) return sendJSON(res, 200, { ok: true });
    const token = crypto.randomBytes(24).toString('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    db.prepare('INSERT INTO password_resets (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, user.id, expires);
    sendJSON(res, 200, { ok: true, dev: true, resetUrl: `/reset-password.html?token=${token}` });
  });

  router.post('/api/auth/reset-password', async (req, res, params, body) => {
    const { token, password } = body;
    if (!token || !password || password.length < 8) return badRequest(res, 'A valid token and an 8+ character password are required.');
    const reset = db.prepare('SELECT * FROM password_resets WHERE token = ?').get(token);
    if (!reset || reset.used || new Date(reset.expires_at) < new Date()) {
      return badRequest(res, 'This reset link is invalid or has expired.');
    }
    db.prepare('UPDATE users SET password_hash = ?, updated_at = datetime(\'now\') WHERE id = ?').run(hashPassword(password), reset.user_id);
    db.prepare('UPDATE password_resets SET used = 1 WHERE token = ?').run(token);
    sendJSON(res, 200, { ok: true });
  });
}

module.exports = register;

'use strict';
const crypto = require('crypto');
const db = require('./db');
const { id, parseCookies, setCookie, unauthorized, forbidden } = require('./util');

const SESSION_COOKIE = 'beersheba_session';
const SESSION_DAYS = 30;

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const check = crypto.scryptSync(password, salt, 64).toString('hex');
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(check, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function createSession(res, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(
    token,
    userId,
    expires.toISOString()
  );
  setCookie(res, SESSION_COOKIE, token, { maxAge: SESSION_DAYS * 24 * 60 * 60 });
  return token;
}

function destroySession(req, res) {
  const cookies = parseCookies(req);
  const token = cookies[SESSION_COOKIE];
  if (token) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  }
  setCookie(res, SESSION_COOKIE, '', { clear: true });
}

/** Resolve the current user from the session cookie, or null. */
function getCurrentUser(req) {
  const cookies = parseCookies(req);
  const token = cookies[SESSION_COOKIE];
  if (!token) return null;
  const session = db.prepare('SELECT * FROM sessions WHERE token = ?').get(token);
  if (!session) return null;
  if (new Date(session.expires_at) < new Date()) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    return null;
  }
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(session.user_id);
  if (!user || user.status === 'SUSPENDED') return null;
  return user;
}

/**
 * Server-side guards. These are the ONLY source of truth for access control —
 * every /api/admin/* route and every mutating route calls one of these before
 * doing anything. Nothing in the client is trusted (roles, prices, book ids,
 * entitlement state are always re-checked here against the database).
 */
function requireAuth(req, res) {
  const user = getCurrentUser(req);
  if (!user) {
    unauthorized(res, 'You must be signed in.');
    return null;
  }
  return user;
}

function requireAdmin(req, res) {
  const user = getCurrentUser(req);
  if (!user) {
    unauthorized(res, 'You must be signed in.');
    return null;
  }
  if (user.role !== 'ADMIN') {
    forbidden(res, 'Admin access required.');
    return null;
  }
  return user;
}

function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    username: u.username || null,
    avatarUrl: u.avatar_url || null,
    bio: u.bio || null,
    role: u.role,
    status: u.status,
    preferredLanguage: u.preferred_language,
    readerSettings: u.reader_settings ? JSON.parse(u.reader_settings) : null,
    hasPassword: !!u.has_password,
    createdAt: u.created_at,
  };
}

module.exports = {
  hashPassword,
  verifyPassword,
  createSession,
  destroySession,
  getCurrentUser,
  requireAuth,
  requireAdmin,
  publicUser,
  SESSION_COOKIE,
};

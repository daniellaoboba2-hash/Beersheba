'use strict';
const crypto = require('crypto');
const db = require('../lib/db');
const { id, sendJSON, badRequest } = require('../lib/util');
const {
  hashPassword, verifyPassword, createSession, destroySession, getCurrentUser, publicUser, requireAuth,
} = require('../lib/auth');
const { logAction } = require('../lib/audit');
const googleAuth = require('../lib/google-auth');

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
    try {
      db.prepare(
        `INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, ?, 'READER')`
      ).run(userId, name, email, hashPassword(password));
    } catch (e) {
      // Race-condition guard: the DB's UNIQUE constraint on email is the
      // real, final protection — the pre-check above is just a fast path
      // for the common case and can't fully close a concurrent-signup race.
      return badRequest(res, 'An account with that email already exists.');
    }
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

  /* ============================================================
     GOOGLE OAUTH (authorization-code flow, server-side only)
     ============================================================
     Google is an additional *authentication method* on the existing
     Beersheba user record — never a separate account type. Every branch
     below resolves to exactly one canonical users.id, and role is always
     left untouched or set to READER; nothing here can produce an admin.
  */

  // Step 1: send the browser to Google. mode=LOGIN and mode=SIGNUP behave
  // identically server-side (both may create an account if none exists);
  // mode=LINK requires an existing Beersheba session and records which
  // account to attach the Google identity to once the user returns.
  router.get('/api/auth/google/start', async (req, res, params, body, query) => {
    if (!googleAuth.isConfigured()) {
      res.writeHead(302, { Location: '/login.html?error=google_not_configured' });
      return res.end();
    }
    const mode = (query.mode || 'LOGIN').toUpperCase();
    let linkUserId = null;
    if (mode === 'LINK') {
      const user = getCurrentUser(req);
      if (!user) {
        res.writeHead(302, { Location: '/login.html?next=%2Findex.html%23profile' });
        return res.end();
      }
      linkUserId = user.id;
    }
    const state = googleAuth.createState(mode, linkUserId);
    res.writeHead(302, { Location: googleAuth.buildAuthUrl(state) });
    res.end();
  });

  router.get('/api/auth/google/callback', async (req, res, params, body, query) => {
    const fail = (reason) => {
      logAction(null, 'GOOGLE_LOGIN_FAILURE', 'auth', null, { reason });
      res.writeHead(302, { Location: `/login.html?error=${encodeURIComponent(reason)}` });
      res.end();
    };

    if (query.error) return fail('google_cancelled'); // user declined consent, etc.
    if (!googleAuth.isConfigured()) return fail('google_not_configured');

    const stateRow = googleAuth.consumeState(query.state);
    if (!stateRow) return fail('invalid_state');

    if (!query.code) return fail('invalid_oauth_callback');

    let profile;
    try {
      profile = await googleAuth.exchangeCodeForProfile(query.code);
    } catch (e) {
      return fail('google_provider_error');
    }
    if (!profile.ok) return fail('google_identity_invalid');
    if (!profile.emailVerified) return fail('google_email_unverified');

    const existingIdentity = db
      .prepare(`SELECT * FROM external_identities WHERE provider = 'google' AND provider_user_id = ?`)
      .get(profile.sub);

    // ---- LINK: attach Google to the already-authenticated account -------
    if (stateRow.mode === 'LINK') {
      if (existingIdentity) {
        if (existingIdentity.user_id !== stateRow.link_user_id) {
          logAction(stateRow.link_user_id, 'GOOGLE_DUPLICATE_LINK_ATTEMPT', 'user', stateRow.link_user_id, {});
          res.writeHead(302, { Location: '/index.html?googleError=already_linked_elsewhere#profile' });
          return res.end();
        }
        // Already linked to this same account — nothing to do, treat as success.
      } else {
        db.prepare(
          `INSERT INTO external_identities (id, user_id, provider, provider_user_id, provider_email) VALUES (?,?,'google',?,?)`
        ).run(id(), stateRow.link_user_id, profile.sub, profile.email);
        logAction(stateRow.link_user_id, 'GOOGLE_ACCOUNT_LINKED', 'user', stateRow.link_user_id, {});
      }
      res.writeHead(302, { Location: '/index.html?googleLinked=1#profile' });
      return res.end();
    }

    // ---- LOGIN / SIGNUP --------------------------------------------------
    let userId;
    if (existingIdentity) {
      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(existingIdentity.user_id);
      if (!user || user.status === 'SUSPENDED') return fail('account_unavailable');
      userId = user.id;
    } else {
      const emailLower = (profile.email || '').toLowerCase();
      const existingByEmail = emailLower ? db.prepare('SELECT * FROM users WHERE email = ?').get(emailLower) : null;
      if (existingByEmail) {
        // A password account already owns this email. We do NOT auto-link on
        // an email string match alone — that's exactly the "blind merge" the
        // spec prohibits. Send them to prove ownership the existing way
        // (password login), after which they can connect Google from
        // Account Settings with an authenticated LINK request instead.
        res.writeHead(302, { Location: '/login.html?error=google_email_exists_use_password' });
        return res.end();
      }
      // Brand-new account. Role is hard-coded READER — Google identity can
      // never grant admin, regardless of the email used.
      userId = id();
      const unusablePassword = crypto.randomBytes(32).toString('hex'); // never revealed; has_password=0 signals "no real password set"
      db.prepare(
        `INSERT INTO users (id, name, email, password_hash, role, avatar_url, has_password, email_verified)
         VALUES (?,?,?,?, 'READER', ?, 0, 1)`
      ).run(userId, profile.name || emailLower.split('@')[0] || 'Reader', emailLower || `${id()}@google.local`, hashPassword(unusablePassword), profile.picture || null);
      db.prepare(
        `INSERT INTO external_identities (id, user_id, provider, provider_user_id, provider_email) VALUES (?,?,'google',?,?)`
      ).run(id(), userId, profile.sub, profile.email);
      logAction(null, 'GOOGLE_ACCOUNT_CREATED', 'user', userId, {});
    }

    // Rotate/replace session on every successful auth to avoid fixation.
    destroySession(req, res);
    createSession(res, userId);
    logAction(userId, 'GOOGLE_LOGIN_SUCCESS', 'user', userId, {});
    res.writeHead(302, { Location: '/' });
    res.end();
  });

  // Disconnect Google — blocked if it's the account's only auth method, so
  // a reader can never accidentally lock themselves out.
  router.post('/api/me/google/disconnect', async (req, res) => {
    const user = requireAuth(req, res);
    if (!user) return;
    if (!user.has_password) {
      logAction(user.id, 'GOOGLE_UNLINK_ATTEMPT', 'user', user.id, { blocked: true });
      return badRequest(res, 'Set a password for your account before disconnecting Google, so you keep a way to sign in.');
    }
    db.prepare(`DELETE FROM external_identities WHERE user_id = ? AND provider = 'google'`).run(user.id);
    logAction(user.id, 'GOOGLE_UNLINK_ATTEMPT', 'user', user.id, { blocked: false });
    sendJSON(res, 200, { ok: true });
  });
}

module.exports = register;

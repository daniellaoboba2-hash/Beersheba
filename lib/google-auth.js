'use strict';
const crypto = require('crypto');
const https = require('https');
const querystring = require('querystring');
const db = require('./db');
const { id } = require('./util');

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || '';

function isConfigured() {
  return !!(CLIENT_ID && CLIENT_SECRET && REDIRECT_URI);
}

function httpsRequestJSON(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let chunks = '';
      res.on('data', (c) => (chunks += c));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(chunks || '{}') });
        } catch (e) {
          resolve({ status: res.statusCode, body: {} });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

/** Creates a single-use, expiring state token and stores server-side context
 * for it (mode + which account to link to, if any). Required so the
 * callback can validate the redirect actually corresponds to a request we
 * issued, and never trust a bare client-supplied "code" alone. */
function createState(mode, linkUserId) {
  const state = crypto.randomBytes(24).toString('hex');
  const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  db.prepare('INSERT INTO oauth_states (state, mode, link_user_id, expires_at) VALUES (?,?,?,?)').run(
    state,
    mode,
    linkUserId || null,
    expires
  );
  return state;
}

/** Validates and single-use-consumes a state token. Returns null if invalid,
 * expired, or already used (deleted immediately on first read). */
function consumeState(state) {
  if (!state) return null;
  const row = db.prepare('SELECT * FROM oauth_states WHERE state = ?').get(state);
  if (!row) return null;
  db.prepare('DELETE FROM oauth_states WHERE state = ?').run(state); // single-use
  if (new Date(row.expires_at) < new Date()) return null;
  return row;
}

function buildAuthUrl(state) {
  const params = querystring.stringify({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    access_type: 'online',
    prompt: 'select_account',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

/** Exchanges an authorization code for tokens, then calls Google's UserInfo
 * endpoint with the resulting access token. We deliberately verify identity
 * this way (a direct, TLS-authenticated server-to-server call to Google)
 * rather than manually parsing/verifying the id_token's JWT signature —
 * it's the same trust boundary with much less code to get wrong. */
async function exchangeCodeForProfile(code) {
  const body = querystring.stringify({
    code,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    redirect_uri: REDIRECT_URI,
    grant_type: 'authorization_code',
  });
  const tokenResp = await httpsRequestJSON(
    {
      hostname: 'oauth2.googleapis.com',
      path: '/token',
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) },
    },
    body
  );
  if (tokenResp.status !== 200 || !tokenResp.body.access_token) {
    return { ok: false, error: 'GOOGLE_TOKEN_EXCHANGE_FAILED' };
  }

  const userResp = await httpsRequestJSON({
    hostname: 'openidconnect.googleapis.com',
    path: '/v1/userinfo',
    method: 'GET',
    headers: { Authorization: `Bearer ${tokenResp.body.access_token}` },
  });
  if (userResp.status !== 200 || !userResp.body.sub) {
    return { ok: false, error: 'GOOGLE_USERINFO_FAILED' };
  }

  const profile = userResp.body;
  return {
    ok: true,
    sub: profile.sub,
    email: profile.email || null,
    emailVerified: profile.email_verified === true || profile.email_verified === 'true',
    name: profile.name || null,
    picture: profile.picture || null,
  };
  // Access/refresh tokens intentionally go out of scope here and are never
  // logged or persisted — see lib/audit.js callers for this flow.
}

module.exports = { isConfigured, createState, consumeState, buildAuthUrl, exchangeCodeForProfile };

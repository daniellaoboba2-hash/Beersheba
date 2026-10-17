'use strict';
const crypto = require('crypto');

function id() {
  return crypto.randomUUID();
}

function slugify(str) {
  return String(str)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
    .slice(0, 80);
}

function sendJSON(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > 15 * 1024 * 1024) {
        reject(new Error('Body too large'));
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      const contentType = req.headers['content-type'] || '';
      try {
        if (contentType.includes('application/json')) {
          resolve(JSON.parse(raw));
        } else if (contentType.includes('application/x-www-form-urlencoded')) {
          resolve(Object.fromEntries(new URLSearchParams(raw)));
        } else {
          // best effort
          try {
            resolve(JSON.parse(raw));
          } catch {
            resolve({});
          }
        }
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function parseCookies(req) {
  const header = req.headers.cookie;
  const out = {};
  if (!header) return out;
  header.split(';').forEach((pair) => {
    const idx = pair.indexOf('=');
    if (idx === -1) return;
    const k = pair.slice(0, idx).trim();
    const v = pair.slice(idx + 1).trim();
    out[k] = decodeURIComponent(v);
  });
  return out;
}

function setCookie(res, name, value, opts = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  parts.push('Path=/');
  parts.push('HttpOnly');
  parts.push('SameSite=Lax');
  if (opts.maxAge) parts.push(`Max-Age=${opts.maxAge}`);
  if (opts.clear) parts.push('Max-Age=0');
  const existing = res.getHeader('Set-Cookie');
  const cookieStr = parts.join('; ');
  if (existing) {
    res.setHeader('Set-Cookie', Array.isArray(existing) ? [...existing, cookieStr] : [existing, cookieStr]);
  } else {
    res.setHeader('Set-Cookie', cookieStr);
  }
}

function badRequest(res, message) {
  sendJSON(res, 400, { error: message || 'Bad request' });
}
function unauthorized(res, message) {
  sendJSON(res, 401, { error: message || 'Unauthorized' });
}
function forbidden(res, message) {
  sendJSON(res, 403, { error: message || 'Forbidden' });
}
function notFound(res, message) {
  sendJSON(res, 404, { error: message || 'Not found' });
}

/** Strip all HTML tags and control characters — used for any free-text field
 * (bio, etc.) that later gets rendered back into the page, so a script tag
 * typed into a bio can never execute. Belt-and-suspenders alongside the
 * front end's own escaping. */
function sanitizePlainText(input, maxLength) {
  if (input == null) return '';
  let text = String(input).replace(/<[^>]*>/g, '');
  text = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  text = text.trim();
  if (maxLength && text.length > maxLength) text = text.slice(0, maxLength);
  return text;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function isValidEmail(email) {
  return typeof email === 'string' && EMAIL_RE.test(email);
}

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
function isValidUsername(username) {
  return typeof username === 'string' && USERNAME_RE.test(username);
}

module.exports = {
  id,
  slugify,
  sendJSON,
  parseBody,
  parseCookies,
  setCookie,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  sanitizePlainText,
  isValidEmail,
  isValidUsername,
};

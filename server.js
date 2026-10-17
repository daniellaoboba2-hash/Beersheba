'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const db = require('./lib/db');
const Router = require('./lib/router');
const { sendJSON, parseBody } = require('./lib/util');
const { getCurrentUser } = require('./lib/auth');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const ADMIN_DIR = path.join(__dirname, 'admin');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
};

function serveFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

function safeJoin(base, requestPath) {
  const resolved = path.normalize(path.join(base, requestPath));
  if (!resolved.startsWith(base)) return null; // path traversal guard
  return resolved;
}

// --------------------------------------------------------------------------
// API router
// --------------------------------------------------------------------------
const router = new Router();
require('./routes/auth')(router);
require('./routes/public')(router);
require('./routes/library')(router);
require('./routes/orders')(router);
require('./routes/admin')(router);

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = decodeURIComponent(url.pathname);
    const query = Object.fromEntries(url.searchParams.entries());

    // ---------------- API ----------------------------------------------
    if (pathname.startsWith('/api/')) {
      const match = router.match(req.method, pathname);
      if (!match) return sendJSON(res, 404, { error: 'Not found' });
      let body = {};
      if (req.method === 'POST' || req.method === 'PATCH' || req.method === 'DELETE') {
        try {
          body = await parseBody(req);
        } catch (e) {
          return sendJSON(res, 400, { error: 'Invalid request body.' });
        }
      }
      await match.handler(req, res, match.params, body, query);
      return;
    }

    // ---------------- uploaded media -------------------------------------
    if (pathname.startsWith('/uploads/')) {
      const filePath = safeJoin(UPLOADS_DIR, pathname.replace('/uploads/', ''));
      if (!filePath) { res.writeHead(400); return res.end('Bad path'); }
      return serveFile(res, filePath);
    }

    // ---------------- admin CMS (server-side protected) -------------------
    if (pathname === '/admin' || pathname.startsWith('/admin/')) {
      const isAsset = /\.(css|js|png|jpg|jpeg|svg|webp|ico)$/i.test(pathname);
      if (!isAsset) {
        // Every non-asset admin page requires a live ADMIN session, checked
        // here on the server — never by hiding a nav link on the client.
        const user = getCurrentUser(req);
        if (!user || user.role !== 'ADMIN') {
          res.writeHead(302, { Location: '/login.html?next=' + encodeURIComponent(pathname) });
          return res.end();
        }
      }
      let rel = pathname.replace(/^\/admin\/?/, '') || 'index.html';
      if (!path.extname(rel)) rel = `${rel}.html`;
      const filePath = safeJoin(ADMIN_DIR, rel);
      if (!filePath) { res.writeHead(400); return res.end('Bad path'); }
      return serveFile(res, filePath);
    }

    // ---------------- public static site -----------------------------------
    let rel = pathname === '/' ? 'index.html' : pathname.slice(1);
    if (!path.extname(rel)) rel = `${rel}.html`;
    const filePath = safeJoin(PUBLIC_DIR, rel);
    if (!filePath) { res.writeHead(400); return res.end('Bad path'); }
    fs.access(filePath, fs.constants.R_OK, (err) => {
      if (err) return serveFile(res, path.join(PUBLIC_DIR, 'index.html'));
      serveFile(res, filePath);
    });
  } catch (err) {
    console.error(err);
    sendJSON(res, 500, { error: 'Internal server error.' });
  }
});

// --------------------------------------------------------------------------
// Scheduled publishing — runs every 30s, promotes anything whose scheduled
// time has arrived. A cron/queue is a better fit at real scale; this is
// enough to make "Schedule Publication" actually work end-to-end today.
// --------------------------------------------------------------------------
function runScheduledPublishing() {
  const now = new Date().toISOString();
  const books = db.prepare(`SELECT id FROM books WHERE status='SCHEDULED' AND scheduled_at <= ?`).all(now);
  books.forEach((b) => {
    db.prepare(`UPDATE books SET status='PUBLISHED', published_at=datetime('now') WHERE id=?`).run(b.id);
    console.log(`[scheduler] published book ${b.id}`);
  });
  const chapters = db.prepare(`SELECT id FROM chapters WHERE status='SCHEDULED' AND scheduled_at <= ?`).all(now);
  chapters.forEach((c) => {
    db.prepare(`UPDATE chapters SET status='PUBLISHED', published_at=datetime('now') WHERE id=?`).run(c.id);
    console.log(`[scheduler] published chapter ${c.id}`);
  });
}
setInterval(runScheduledPublishing, 30 * 1000);

server.listen(PORT, () => {
  console.log(`Beersheba running at http://localhost:${PORT}`);
  console.log(`Admin CMS at        http://localhost:${PORT}/admin`);
  console.log(`Paystack mode:      ${require('./lib/paystack').LIVE ? 'LIVE' : 'DEV SIMULATOR (no secret key set)'}`);
});

module.exports = server;

'use strict';
/**
 * Database layer — async interface over Postgres (Supabase) or SQLite.
 *
 * Exposes `db.prepare(sql).run/get/all(...values)` returning Promises.
 * The rest of the codebase awaits these calls. In SQLite mode the
 * underlying node:sqlite calls are synchronous but wrapped in
 * Promise.resolve so both modes share the same async interface.
 *
 * Selection:
 *  - USE_SUPABASE=1 → Postgres connection pool (pg)
 *  - otherwise      → local node:sqlite file at data/beersheba.sqlite
 *
 * Postgres SQL translation: the app emits SQLite-flavoured SQL in some
 * places; this shim translates known fragments at execution time:
 *  - datetime('now') → now()
 *  - datetime('now', '-N days') → now() - interval 'N day'
 *  - INSERT OR IGNORE INTO → INSERT INTO ... ON CONFLICT DO NOTHING
 *  - date(col) → (col AT TIME ZONE 'UTC')::date
 *  - PRAGMA ... → (stripped)
 *
 * Returns:
 *  - .run()  → { changes, lastInsertRowid }
 *  - .get()  → row object or undefined
 *  - .all()  → array of row objects
 */

const path = require('path');
const fs = require('fs');

const USE_SUPABASE = process.env.USE_SUPABASE === '1';

function translateSQL(sql) {
  let out = sql;
  out = out.replace(/datetime\('now'\)/g, 'now()');
  out = out.replace(
    /datetime\('now'\s*,\s*'(?:-|\+)?\s*(\d+)\s*(days?|months?|years?)'\)/gi,
    (m, n, unit) => {
      const u = unit.toLowerCase().startsWith('day')
        ? 'day'
        : unit.toLowerCase().startsWith('month')
          ? 'month'
          : 'year';
      return `now() - interval '${parseInt(n, 10)} ${u}'`;
    }
  );
  out = out.replace(/INSERT OR IGNORE INTO/g, 'INSERT INTO');
  out = out.replace(/PRAGMA[^;]+;?/g, '');
  out = out.replace(/date\((\w+)\)/g, "($1 AT TIME ZONE 'UTC')::date");
  return out;
}

function toParameterized(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => {
    i += 1;
    return `$${i}`;
  });
}

let driver;

if (USE_SUPABASE) {
  const { Pool } = require('pg');

  let connStr = process.env.SUPABASE_DB_URL;
  if (!connStr) {
    // Assemble from Supabase project URL + DB password.
    const url = new URL(process.env.VITE_SUPABASE_URL || '');
    const host = url.hostname;
    connStr = `postgresql://postgres:${process.env.SUPABASE_DB_PASSWORD || 'postgres'}@${host}:5432/postgres`;
  }

  const pool = new Pool({
    connectionString: connStr,
    max: 8,
    idleTimeoutMillis: 30000,
  });

  pool.on('error', (err) => {
    console.error('[db] Postgres pool error:', err.message);
  });

  class PgStmt {
    constructor(sql) {
      this._sql = sql;
    }
    async _query(values) {
      const translated = translateSQL(this._sql);
      const numbered = toParameterized(translated);
      const client = await pool.connect();
      try {
        const result = await client.query(numbered, values);
        return result;
      } finally {
        client.release();
      }
    }
    async run(...values) {
      const result = await this._query(values);
      const firstRow = result.rows[0];
      return {
        changes: result.rowCount || 0,
        lastInsertRowid: firstRow ? (firstRow.id || null) : null,
      };
    }
    async get(...values) {
      const result = await this._query(values);
      return result.rows[0];
    }
    async all(...values) {
      const result = await this._query(values);
      return result.rows;
    }
  }

  driver = {
    prepare(sql) {
      return new PgStmt(sql);
    },
    async exec(sql) {
      await pool.query(translateSQL(sql));
    },
    pool,
    isPostgres: true,
  };
} else {
  const { DatabaseSync } = require('node:sqlite');
  const DATA_DIR = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const DB_PATH = path.join(DATA_DIR, 'beersheba.sqlite');
  const sqliteDb = new DatabaseSync(DB_PATH);
  sqliteDb.exec('PRAGMA foreign_keys = ON;');
  sqliteDb.exec('PRAGMA journal_mode = WAL;');

  const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
  username TEXT UNIQUE, password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'READER', status TEXT NOT NULL DEFAULT 'ACTIVE',
  avatar_url TEXT, bio TEXT, preferred_language TEXT DEFAULT 'English',
  reader_settings TEXT, has_password INTEGER NOT NULL DEFAULT 1,
  email_verified INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS password_resets (
  token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), expires_at TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS genres (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, slug TEXT NOT NULL UNIQUE);
CREATE TABLE IF NOT EXISTS tags (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, slug TEXT NOT NULL UNIQUE);
CREATE TABLE IF NOT EXISTS books (
  id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, title TEXT NOT NULL, subtitle TEXT,
  author TEXT NOT NULL, synopsis TEXT, short_description TEXT,
  original_language TEXT DEFAULT 'English', primary_genre_id TEXT REFERENCES genres(id),
  cover_image TEXT, featured_image TEXT, social_image TEXT,
  access_tiers TEXT NOT NULL DEFAULT '[]',
  vip_eligible INTEGER NOT NULL DEFAULT 0, vip_exclusive INTEGER NOT NULL DEFAULT 0,
  pdf_eligible INTEGER NOT NULL DEFAULT 0, pdf_standard_access INTEGER NOT NULL DEFAULT 0,
  pdf_enabled INTEGER NOT NULL DEFAULT 0, pdf_url TEXT, pdf_filename TEXT, pdf_size_bytes INTEGER,
  free_preview_chapters INTEGER NOT NULL DEFAULT 1,
  featured INTEGER NOT NULL DEFAULT 0, trending INTEGER NOT NULL DEFAULT 0,
  best_seller INTEGER NOT NULL DEFAULT 0, new_release INTEGER NOT NULL DEFAULT 0,
  seo_title TEXT, meta_description TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT', scheduled_at TEXT, published_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS book_genres (
  book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  genre_id TEXT NOT NULL REFERENCES genres(id) ON DELETE CASCADE,
  PRIMARY KEY (book_id, genre_id)
);
CREATE TABLE IF NOT EXISTS book_tags (
  book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (book_id, tag_id)
);
CREATE TABLE IF NOT EXISTS chapters (
  id TEXT PRIMARY KEY, book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  number INTEGER NOT NULL, order_index REAL NOT NULL, title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '', is_preview INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'DRAFT', scheduled_at TEXT, published_at TEXT,
  voice_enabled INTEGER NOT NULL DEFAULT 1, audio_source TEXT,
  audio_status TEXT NOT NULL DEFAULT 'NOT_GENERATED',
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(book_id, number)
);
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT,
  price_cents INTEGER NOT NULL, currency TEXT NOT NULL DEFAULT 'USD',
  type TEXT NOT NULL, chapter_allowance INTEGER, display_order INTEGER NOT NULL DEFAULT 0,
  badge TEXT, active INTEGER NOT NULL DEFAULT 1, eligibility_rules TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS product_price_history (
  id TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES products(id),
  price_cents INTEGER NOT NULL, currency TEXT NOT NULL, changed_by TEXT REFERENCES users(id),
  changed_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS book_product_access (
  book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  PRIMARY KEY (book_id, product_id)
);
CREATE TABLE IF NOT EXISTS site_settings (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
  product_id TEXT NOT NULL REFERENCES products(id), amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL, provider TEXT NOT NULL DEFAULT 'paystack',
  provider_reference TEXT, status TEXT NOT NULL DEFAULT 'PENDING',
  book_id TEXT REFERENCES books(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS entitlements (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
  order_id TEXT REFERENCES orders(id), product_id TEXT NOT NULL REFERENCES products(id),
  type TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'UNUSED', book_id TEXT REFERENCES books(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')), consumed_at TEXT
);
CREATE TABLE IF NOT EXISTS vip_memberships (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL UNIQUE REFERENCES users(id),
  order_id TEXT REFERENCES orders(id), payment_reference TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE', created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS library_items (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
  book_id TEXT NOT NULL REFERENCES books(id), source TEXT NOT NULL,
  added_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(user_id, book_id)
);
CREATE TABLE IF NOT EXISTS reading_progress (
  user_id TEXT NOT NULL REFERENCES users(id), book_id TEXT NOT NULL REFERENCES books(id),
  chapter_number INTEGER NOT NULL DEFAULT 1, percent INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY (user_id, book_id)
);
CREATE TABLE IF NOT EXISTS bookmarks (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
  book_id TEXT NOT NULL REFERENCES books(id), created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, book_id)
);
CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY, book_id TEXT NOT NULL REFERENCES books(id),
  chapter_id TEXT REFERENCES chapters(id), user_id TEXT NOT NULL REFERENCES users(id),
  parent_id TEXT REFERENCES comments(id), body TEXT NOT NULL, likes INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'VISIBLE', created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS comment_reports (
  id TEXT PRIMARY KEY, comment_id TEXT NOT NULL REFERENCES comments(id),
  reporter_id TEXT NOT NULL REFERENCES users(id), reason TEXT,
  status TEXT NOT NULL DEFAULT 'OPEN', created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY, book_id TEXT NOT NULL REFERENCES books(id),
  user_id TEXT NOT NULL REFERENCES users(id), rating INTEGER NOT NULL, body TEXT,
  status TEXT NOT NULL DEFAULT 'APPROVED', created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(book_id, user_id)
);
CREATE TABLE IF NOT EXISTS translations (
  id TEXT PRIMARY KEY, content_type TEXT NOT NULL, content_id TEXT NOT NULL,
  language TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'PENDING', translated_text TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(content_type, content_id, language)
);
CREATE TABLE IF NOT EXISTS media (
  id TEXT PRIMARY KEY, filename TEXT NOT NULL, original_name TEXT, type TEXT NOT NULL,
  size_bytes INTEGER, book_id TEXT REFERENCES books(id), user_id TEXT REFERENCES users(id),
  uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS pdf_downloads (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
  book_id TEXT NOT NULL REFERENCES books(id), downloaded_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS policies (
  key TEXT PRIMARY KEY, title TEXT NOT NULL, content TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'DRAFT', updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS support_messages (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL, topic TEXT,
  message TEXT NOT NULL, user_id TEXT REFERENCES users(id), status TEXT NOT NULL DEFAULT 'OPEN',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY, admin_id TEXT REFERENCES users(id), action TEXT NOT NULL,
  entity TEXT, entity_id TEXT, metadata TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS external_identities (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL, provider_user_id TEXT NOT NULL, provider_email TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(provider, provider_user_id)
);
CREATE TABLE IF NOT EXISTS oauth_states (
  state TEXT PRIMARY KEY, mode TEXT NOT NULL, link_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chapters_book ON chapters(book_id);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_entitlements_user ON entitlements(user_id);
CREATE INDEX IF NOT EXISTS idx_library_user ON library_items(user_id);
CREATE INDEX IF NOT EXISTS idx_comments_book ON comments(book_id);
CREATE INDEX IF NOT EXISTS idx_reviews_book ON reviews(book_id);
CREATE INDEX IF NOT EXISTS idx_books_status ON books(status);
CREATE INDEX IF NOT EXISTS idx_external_identities_user ON external_identities(user_id);
`;

  sqliteDb.exec(SCHEMA);

  class SqliteStmt {
    constructor(sql) {
      this._stmt = sqliteDb.prepare(sql);
    }
    async run(...values) {
      return this._stmt.run(...values);
    }
    async get(...values) {
      return this._stmt.get(...values);
    }
    async all(...values) {
      return this._stmt.all(...values);
    }
  }

  driver = {
    prepare(sql) {
      return new SqliteStmt(sql);
    },
    async exec(sql) {
      sqliteDb.exec(sql);
    },
    isPostgres: false,
  };
}

module.exports = driver;

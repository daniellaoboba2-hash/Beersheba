'use strict';
/**
 * Database layer.
 *
 * Uses Node's built-in `node:sqlite` module (stable behind an experimental
 * flag as of Node 22) so the whole platform runs with ZERO npm dependencies.
 * If you deploy on a host that supports better-sqlite3 you can swap the two
 * top lines for `const { DatabaseSync } = require('better-sqlite3');`-style
 * wrapper — the query API used below (prepare/run/get/all) is intentionally
 * the same shape in both, so nothing else in the codebase needs to change.
 */
const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = path.join(DATA_DIR, 'beersheba.sqlite');

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA journal_mode = WAL;');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  username TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'READER', -- READER | ADMIN
  status TEXT NOT NULL DEFAULT 'ACTIVE', -- ACTIVE | SUSPENDED
  avatar_url TEXT,
  bio TEXT,
  preferred_language TEXT DEFAULT 'English',
  reader_settings TEXT, -- JSON: fontSize, fontFamily, lineSpacing, width, theme, voiceSpeed
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS password_resets (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS genres (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS books (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  subtitle TEXT,
  author TEXT NOT NULL,
  synopsis TEXT,
  short_description TEXT,
  original_language TEXT DEFAULT 'English',
  primary_genre_id TEXT REFERENCES genres(id),
  cover_image TEXT,
  featured_image TEXT,
  social_image TEXT,

  -- commercial / access configuration
  access_tiers TEXT NOT NULL DEFAULT '[]', -- JSON array subset of ["20","30","50"]
  vip_eligible INTEGER NOT NULL DEFAULT 0,
  vip_exclusive INTEGER NOT NULL DEFAULT 0,
  pdf_eligible INTEGER NOT NULL DEFAULT 0, -- VIP PDF access
  pdf_standard_access INTEGER NOT NULL DEFAULT 0, -- standard-purchase PDF access
  pdf_enabled INTEGER NOT NULL DEFAULT 0, -- master "PDF Available" switch
  pdf_url TEXT, -- private path, never served by the public /uploads static route
  pdf_filename TEXT,
  pdf_size_bytes INTEGER,
  free_preview_chapters INTEGER NOT NULL DEFAULT 1,

  -- flags
  featured INTEGER NOT NULL DEFAULT 0,
  trending INTEGER NOT NULL DEFAULT 0,
  best_seller INTEGER NOT NULL DEFAULT 0,
  new_release INTEGER NOT NULL DEFAULT 0,

  -- seo
  seo_title TEXT,
  meta_description TEXT,

  -- publishing state
  status TEXT NOT NULL DEFAULT 'DRAFT', -- DRAFT|REVIEW|SCHEDULED|PUBLISHED|UNPUBLISHED|ARCHIVED
  scheduled_at TEXT,
  published_at TEXT,

  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
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
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  order_index REAL NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  is_preview INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'DRAFT', -- DRAFT|SCHEDULED|PUBLISHED|UNPUBLISHED
  scheduled_at TEXT,
  published_at TEXT,
  voice_enabled INTEGER NOT NULL DEFAULT 1,
  audio_source TEXT, -- URL to generated audio file, if any
  audio_status TEXT NOT NULL DEFAULT 'NOT_GENERATED', -- NOT_GENERATED|GENERATING|READY|FAILED
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(book_id, number)
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  price_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  type TEXT NOT NULL, -- READING_PASS | VIP_MEMBERSHIP (extensible — see book_product_access for how a book opts in)
  chapter_allowance INTEGER, -- set for READING_PASS products; null for VIP_MEMBERSHIP
  display_order INTEGER NOT NULL DEFAULT 0,
  badge TEXT, -- optional small label, e.g. "Most Popular"
  active INTEGER NOT NULL DEFAULT 1,
  eligibility_rules TEXT, -- JSON, free-form
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS product_price_history (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  price_cents INTEGER NOT NULL,
  currency TEXT NOT NULL,
  changed_by TEXT REFERENCES users(id),
  changed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Explicit book <-> reading-pass eligibility. Replaces inferring eligibility
-- from chapter count — a book opts into whichever reading-pass products an
-- admin assigns it to, regardless of how many chapters either one has.
CREATE TABLE IF NOT EXISTS book_product_access (
  book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  PRIMARY KEY (book_id, product_id)
);

CREATE TABLE IF NOT EXISTS site_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'paystack',
  provider_reference TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING', -- PENDING|PAID|FAILED|CANCELLED|REFUNDED
  book_id TEXT REFERENCES books(id), -- set once the reader chooses their book (standard tiers only)
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS entitlements (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  order_id TEXT REFERENCES orders(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  type TEXT NOT NULL, -- CHAPTER_ACCESS_20 | CHAPTER_ACCESS_30 | CHAPTER_ACCESS_50
  status TEXT NOT NULL DEFAULT 'UNUSED', -- UNUSED|CONSUMED|REVOKED|EXPIRED
  book_id TEXT REFERENCES books(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  consumed_at TEXT
);

CREATE TABLE IF NOT EXISTS vip_memberships (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id),
  order_id TEXT REFERENCES orders(id),
  payment_reference TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE', -- ACTIVE|REVOKED
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS library_items (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  book_id TEXT NOT NULL REFERENCES books(id),
  source TEXT NOT NULL, -- ENTITLEMENT | VIP
  added_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, book_id)
);

CREATE TABLE IF NOT EXISTS reading_progress (
  user_id TEXT NOT NULL REFERENCES users(id),
  book_id TEXT NOT NULL REFERENCES books(id),
  chapter_number INTEGER NOT NULL DEFAULT 1,
  percent INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, book_id)
);

CREATE TABLE IF NOT EXISTS bookmarks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  book_id TEXT NOT NULL REFERENCES books(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, book_id)
);

CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES books(id),
  chapter_id TEXT REFERENCES chapters(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  parent_id TEXT REFERENCES comments(id),
  body TEXT NOT NULL,
  likes INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'VISIBLE', -- VISIBLE|HIDDEN|DELETED
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS comment_reports (
  id TEXT PRIMARY KEY,
  comment_id TEXT NOT NULL REFERENCES comments(id),
  reporter_id TEXT NOT NULL REFERENCES users(id),
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'OPEN', -- OPEN|DISMISSED|RESOLVED
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES books(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  rating INTEGER NOT NULL,
  body TEXT,
  status TEXT NOT NULL DEFAULT 'APPROVED', -- PENDING|APPROVED|HIDDEN|DELETED
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(book_id, user_id)
);

CREATE TABLE IF NOT EXISTS translations (
  id TEXT PRIMARY KEY,
  content_type TEXT NOT NULL, -- CHAPTER | COMMENT
  content_id TEXT NOT NULL,
  language TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING', -- PENDING|READY|FAILED
  translated_text TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(content_type, content_id, language)
);

CREATE TABLE IF NOT EXISTS media (
  id TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  original_name TEXT,
  type TEXT NOT NULL, -- COVER|FEATURED|CHAPTER_IMAGE|PROMO|PDF|AVATAR
  size_bytes INTEGER,
  book_id TEXT REFERENCES books(id),
  user_id TEXT REFERENCES users(id), -- set for AVATAR uploads
  uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pdf_downloads (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  book_id TEXT NOT NULL REFERENCES books(id),
  downloaded_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS policies (
  key TEXT PRIMARY KEY, -- terms|privacy|cookies|copyright|content-guidelines|refunds
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'DRAFT', -- DRAFT|PUBLISHED
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS support_messages (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  topic TEXT,
  message TEXT NOT NULL,
  user_id TEXT REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'OPEN', -- OPEN|CLOSED
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  admin_id TEXT REFERENCES users(id),
  action TEXT NOT NULL,
  entity TEXT,
  entity_id TEXT,
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_chapters_book ON chapters(book_id);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_entitlements_user ON entitlements(user_id);
CREATE INDEX IF NOT EXISTS idx_library_user ON library_items(user_id);
CREATE INDEX IF NOT EXISTS idx_comments_book ON comments(book_id);
CREATE INDEX IF NOT EXISTS idx_reviews_book ON reviews(book_id);
CREATE INDEX IF NOT EXISTS idx_books_status ON books(status);
`;

db.exec(SCHEMA);

// --------------------------------------------------------------------------
// Lightweight migrations: add columns introduced after the initial schema
// without requiring a fresh database. CREATE TABLE IF NOT EXISTS above won't
// alter a table that already exists, so new columns are added here.
// --------------------------------------------------------------------------
function columnExists(table, column) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  return cols.some((c) => c.name === column);
}
function ensureColumn(table, column, ddl) {
  if (!columnExists(table, column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}
ensureColumn('users', 'username', 'username TEXT');
ensureColumn('users', 'avatar_url', 'avatar_url TEXT');
ensureColumn('users', 'bio', 'bio TEXT');
ensureColumn('media', 'user_id', 'user_id TEXT REFERENCES users(id)');
ensureColumn('books', 'pdf_standard_access', 'pdf_standard_access INTEGER NOT NULL DEFAULT 0');
ensureColumn('books', 'pdf_enabled', 'pdf_enabled INTEGER NOT NULL DEFAULT 0');
ensureColumn('books', 'pdf_url', 'pdf_url TEXT');
ensureColumn('books', 'pdf_filename', 'pdf_filename TEXT');
ensureColumn('books', 'pdf_size_bytes', 'pdf_size_bytes INTEGER');
ensureColumn('users', 'has_password', 'has_password INTEGER NOT NULL DEFAULT 1');
ensureColumn('users', 'email_verified', 'email_verified INTEGER NOT NULL DEFAULT 0');
ensureColumn('products', 'chapter_allowance', 'chapter_allowance INTEGER');
ensureColumn('products', 'display_order', 'display_order INTEGER NOT NULL DEFAULT 0');
ensureColumn('products', 'badge', 'badge TEXT');

db.exec(`
CREATE TABLE IF NOT EXISTS external_identities (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL, -- 'google'
  provider_user_id TEXT NOT NULL, -- Google's stable "sub" claim — never the email
  provider_email TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(provider, provider_user_id)
);
CREATE INDEX IF NOT EXISTS idx_external_identities_user ON external_identities(user_id);

CREATE TABLE IF NOT EXISTS oauth_states (
  state TEXT PRIMARY KEY,
  mode TEXT NOT NULL, -- LOGIN | SIGNUP | LINK
  link_user_id TEXT, -- set only for LINK mode, so the callback knows which account to attach to
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);
`);

module.exports = db;

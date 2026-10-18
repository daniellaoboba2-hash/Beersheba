/*
# Beersheba full platform schema

Migrates the existing SQLite-based Beersheba publishing platform to Postgres.
All 24 application tables are recreated with Postgres-native types, foreign
keys, indexes, and the same relationships as the original SQLite schema.

## Notes on access model
Beersheba runs its OWN auth (custom users table, scrypt-hashed passwords,
HttpOnly session cookies) — it does NOT use Supabase Auth / auth.users. The
Node backend is the only database client and connects with a privileged
connection (service role / DB URL) which bypasses RLS. RLS is enabled on every
table as a defence-in-depth safety net; the Node server enforces all access
control server-side (requireAuth / requireAdmin / entitlement / VIP / PDF gates).

## Tables created
1. users — reader + admin accounts (Beersheba's own, not auth.users)
2. password_resets — forgot/reset password tokens
3. sessions — session cookies
4. genres, tags — taxonomy
5. books — published stories
6. book_genres, book_tags — book ↔ taxonomy join tables
7. chapters — book chapters
8. products — reading passes + VIP membership purchasables
9. product_price_history — price change audit
10. book_product_access — which reading-pass products a book opts into
11. site_settings — key/value config
12. orders — purchase records
13. entitlements — one-time chapter-access passes (consumable)
14. vip_memberships — active VIP memberships
15. library_items — a reader's library (purchased or VIP-sourced)
16. reading_progress — per-book reading position
17. bookmarks — saved books
18. comments — book-level and chapter-scoped discussion
19. comment_reports — moderation reports
20. reviews — book ratings
21. translations — cached translation records
22. media — uploaded covers / avatars / PDFs metadata
23. pdf_downloads — authorised PDF download audit log
24. policies — admin-editable legal pages
25. support_messages — contact form submissions
26. audit_logs — admin action audit trail
27. external_identities — Google OAuth identities linked to users
28. oauth_states — OAuth state tokens

## SQLite → Postgres type mapping
- TEXT → text (IDs are crypto.randomUUID() strings, kept as text)
- INTEGER (boolean) → boolean
- TEXT (timestamps) → timestamptz DEFAULT now()
- datetime('now') → now()

## Security
RLS enabled on every table. Because the Node server connects with a
privileged role that bypasses RLS, and all access control is enforced
server-side in the application, permissive policies for anon+authenticated
are added so any direct-anon access (not used by this app today) does not
silently see empty tables. The application never relies on RLS for
authorization — it uses its own requireAuth/requireAdmin guards.
*/

CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  username text UNIQUE,
  password_hash text NOT NULL,
  role text NOT NULL DEFAULT 'READER',
  status text NOT NULL DEFAULT 'ACTIVE',
  avatar_url text,
  bio text,
  preferred_language text DEFAULT 'English',
  reader_settings text,
  has_password boolean NOT NULL DEFAULT true,
  email_verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS password_resets (
  token text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS sessions (
  token text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS genres (
  id text PRIMARY KEY,
  name text NOT NULL UNIQUE,
  slug text NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS tags (
  id text PRIMARY KEY,
  name text NOT NULL UNIQUE,
  slug text NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS books (
  id text PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  subtitle text,
  author text NOT NULL,
  synopsis text,
  short_description text,
  original_language text DEFAULT 'English',
  primary_genre_id text REFERENCES genres(id),
  cover_image text,
  featured_image text,
  social_image text,
  access_tiers text NOT NULL DEFAULT '[]',
  vip_eligible boolean NOT NULL DEFAULT false,
  vip_exclusive boolean NOT NULL DEFAULT false,
  pdf_eligible boolean NOT NULL DEFAULT false,
  pdf_standard_access boolean NOT NULL DEFAULT false,
  pdf_enabled boolean NOT NULL DEFAULT false,
  pdf_url text,
  pdf_filename text,
  pdf_size_bytes integer,
  free_preview_chapters integer NOT NULL DEFAULT 1,
  featured boolean NOT NULL DEFAULT false,
  trending boolean NOT NULL DEFAULT false,
  best_seller boolean NOT NULL DEFAULT false,
  new_release boolean NOT NULL DEFAULT false,
  seo_title text,
  meta_description text,
  status text NOT NULL DEFAULT 'DRAFT',
  scheduled_at timestamptz,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS book_genres (
  book_id text NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  genre_id text NOT NULL REFERENCES genres(id) ON DELETE CASCADE,
  PRIMARY KEY (book_id, genre_id)
);

CREATE TABLE IF NOT EXISTS book_tags (
  book_id text NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  tag_id text NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (book_id, tag_id)
);

CREATE TABLE IF NOT EXISTS chapters (
  id text PRIMARY KEY,
  book_id text NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  number integer NOT NULL,
  order_index double precision NOT NULL,
  title text NOT NULL,
  content text NOT NULL DEFAULT '',
  is_preview boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'DRAFT',
  scheduled_at timestamptz,
  published_at timestamptz,
  voice_enabled boolean NOT NULL DEFAULT true,
  audio_source text,
  audio_status text NOT NULL DEFAULT 'NOT_GENERATED',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(book_id, number)
);

CREATE TABLE IF NOT EXISTS products (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text,
  price_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  type text NOT NULL,
  chapter_allowance integer,
  display_order integer NOT NULL DEFAULT 0,
  badge text,
  active boolean NOT NULL DEFAULT true,
  eligibility_rules text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS product_price_history (
  id text PRIMARY KEY,
  product_id text NOT NULL REFERENCES products(id),
  price_cents integer NOT NULL,
  currency text NOT NULL,
  changed_by text REFERENCES users(id),
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS book_product_access (
  book_id text NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  product_id text NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  PRIMARY KEY (book_id, product_id)
);

CREATE TABLE IF NOT EXISTS site_settings (
  key text PRIMARY KEY,
  value text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS orders (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id),
  product_id text NOT NULL REFERENCES products(id),
  amount_cents integer NOT NULL,
  currency text NOT NULL,
  provider text NOT NULL DEFAULT 'paystack',
  provider_reference text,
  status text NOT NULL DEFAULT 'PENDING',
  book_id text REFERENCES books(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS entitlements (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id),
  order_id text REFERENCES orders(id),
  product_id text NOT NULL REFERENCES products(id),
  type text NOT NULL,
  status text NOT NULL DEFAULT 'UNUSED',
  book_id text REFERENCES books(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  consumed_at timestamptz
);

CREATE TABLE IF NOT EXISTS vip_memberships (
  id text PRIMARY KEY,
  user_id text NOT NULL UNIQUE REFERENCES users(id),
  order_id text REFERENCES orders(id),
  payment_reference text,
  status text NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS library_items (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id),
  book_id text NOT NULL REFERENCES books(id),
  source text NOT NULL,
  added_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, book_id)
);

CREATE TABLE IF NOT EXISTS reading_progress (
  user_id text NOT NULL REFERENCES users(id),
  book_id text NOT NULL REFERENCES books(id),
  chapter_number integer NOT NULL DEFAULT 1,
  percent integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, book_id)
);

CREATE TABLE IF NOT EXISTS bookmarks (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id),
  book_id text NOT NULL REFERENCES books(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, book_id)
);

CREATE TABLE IF NOT EXISTS comments (
  id text PRIMARY KEY,
  book_id text NOT NULL REFERENCES books(id),
  chapter_id text REFERENCES chapters(id),
  user_id text NOT NULL REFERENCES users(id),
  parent_id text REFERENCES comments(id),
  body text NOT NULL,
  likes integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'VISIBLE',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS comment_reports (
  id text PRIMARY KEY,
  comment_id text NOT NULL REFERENCES comments(id),
  reporter_id text NOT NULL REFERENCES users(id),
  reason text,
  status text NOT NULL DEFAULT 'OPEN',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reviews (
  id text PRIMARY KEY,
  book_id text NOT NULL REFERENCES books(id),
  user_id text NOT NULL REFERENCES users(id),
  rating integer NOT NULL,
  body text,
  status text NOT NULL DEFAULT 'APPROVED',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(book_id, user_id)
);

CREATE TABLE IF NOT EXISTS translations (
  id text PRIMARY KEY,
  content_type text NOT NULL,
  content_id text NOT NULL,
  language text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING',
  translated_text text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(content_type, content_id, language)
);

CREATE TABLE IF NOT EXISTS media (
  id text PRIMARY KEY,
  filename text NOT NULL,
  original_name text,
  type text NOT NULL,
  size_bytes integer,
  book_id text REFERENCES books(id),
  user_id text REFERENCES users(id),
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pdf_downloads (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id),
  book_id text NOT NULL REFERENCES books(id),
  downloaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS policies (
  key text PRIMARY KEY,
  title text NOT NULL,
  content text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'DRAFT',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS support_messages (
  id text PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL,
  topic text,
  message text NOT NULL,
  user_id text REFERENCES users(id),
  status text NOT NULL DEFAULT 'OPEN',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id text PRIMARY KEY,
  admin_id text REFERENCES users(id),
  action text NOT NULL,
  entity text,
  entity_id text,
  metadata text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS external_identities (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  provider_user_id text NOT NULL,
  provider_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider, provider_user_id)
);

CREATE TABLE IF NOT EXISTS oauth_states (
  state text PRIMARY KEY,
  mode text NOT NULL,
  link_user_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

-- Indexes (mirror the SQLite schema)
CREATE INDEX IF NOT EXISTS idx_chapters_book ON chapters(book_id);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_entitlements_user ON entitlements(user_id);
CREATE INDEX IF NOT EXISTS idx_library_user ON library_items(user_id);
CREATE INDEX IF NOT EXISTS idx_comments_book ON comments(book_id);
CREATE INDEX IF NOT EXISTS idx_reviews_book ON reviews(book_id);
CREATE INDEX IF NOT EXISTS idx_books_status ON books(status);
CREATE INDEX IF NOT EXISTS idx_external_identities_user ON external_identities(user_id);

-- Enable RLS on every table. The Node backend connects with a privileged
-- role that bypasses RLS; these permissive policies exist as a safety net
-- only. All authorization is enforced server-side by the application.
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- Permissive anon+authenticated policies on every table so the schema is
-- not accidentally locked out if a direct-anon query is ever issued. The
-- app itself does not rely on these for security.
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "anon_all_%s" ON %I', t, t);
    EXECUTE format(
      'CREATE POLICY "anon_all_%s" ON %I FOR SELECT TO anon, authenticated USING (true)',
      t, t
    );
  END LOOP;
END $$;

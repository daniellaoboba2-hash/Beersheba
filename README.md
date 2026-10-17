# Beersheba — Publishing Platform

A working full-stack prototype: public reader site + admin publishing CMS,
built on a real (if intentionally minimal) Node.js backend with a real
SQLite database. Zero npm dependencies — it runs with nothing but Node.js.

## How to start it

```
cd beersheba
npm run seed     # only needed once, or after deleting data/beersheba.sqlite
npm start
```

Requires **Node.js 22.5+** (uses the built-in `node:sqlite` module — no
`npm install` step, no native build tools needed).

- Public site: **http://localhost:3000**
- Admin CMS: **http://localhost:3000/admin** (redirects to login if you're
  not an authenticated admin — this is enforced server-side, not just a
  hidden nav link)

## Demo credentials

| Role | Email | Password |
|---|---|---|
| Admin | `admin@beersheba.app` | `AdminPass123!` |
| Reader (seeded Lifetime VIP member) | `annabella@email.com` | `ReaderPass123!` |

Both are seeded by `npm run seed`. You can also register a fresh reader
account from `/register.html` at any time.

## Environment variables (all optional)

| Variable | Effect if unset |
|---|---|
| `PORT` | Defaults to 3000 |
| `PAYSTACK_SECRET_KEY` / `PAYSTACK_PUBLIC_KEY` | Without these, payments run in a clearly-labeled **DEV SIMULATOR** — checkout works end-to-end (order → "payment" → entitlement/VIP) but no real money moves and no real Paystack API is called. Set both to go live; no code changes needed, `lib/paystack.js` switches automatically. |
| `TRANSLATE_API_KEY` | Without this, the Translate button returns a clearly-labeled "not connected" message instead of pretending to translate. Wire a real provider (DeepL, Google Cloud Translate, etc.) into `lib/translate.js`'s `callProvider()` function. |

---

## 1. Project structure

```
beersheba/
├── server.js              # HTTP server, static file serving, route mounting, scheduler
├── package.json            # zero dependencies
├── lib/
│   ├── db.js                # SQLite schema (22 tables) + connection
│   ├── seed.js               # seeds admin/demo accounts, genres, tags, products, 10 books
│   ├── auth.js                # password hashing, sessions, requireAuth/requireAdmin guards
│   ├── access.js               # entitlement consumption, VIP checks, chapter-read gating
│   ├── validation.js            # publish-readiness validation (books & chapters)
│   ├── paystack.js               # real Paystack REST calls + dev simulator fallback
│   ├── translate.js               # translation provider abstraction (unconfigured by default)
│   ├── stats.js                     # every "live number" shown anywhere — all real queries
│   ├── audit.js                      # admin action logging
│   ├── router.js                      # tiny dependency-free HTTP router
│   └── util.js                         # request/response helpers
├── routes/
│   ├── auth.js       (register/login/logout/session/forgot-reset password)
│   ├── public.js      (books, chapters, genres/tags, products, comments, reviews, translate)
│   ├── library.js       (bookmarks, reading progress, "My Library", reader settings)
│   ├── orders.js          (checkout, payment verification, entitlement consumption)
│   └── admin.js             (every /api/admin/* route — books, chapters, genres, tags,
│                              products, orders, entitlements, VIP, readers, comments,
│                              reports, translations, audit log, media/cover uploads)
├── public/            # the approved reader-facing design, now data-driven
│   ├── index.html       (single-page app shell — same nav/drawer/search markup as approved)
│   ├── login.html, register.html, forgot-password.html, reset-password.html
│   ├── css/style.css      (extracted verbatim from the approved design — untouched)
│   ├── css/extra.css       (additions only: auth forms, purchase modal, VIP sales sections)
│   └── js/
│       ├── api.js             (fetch wrapper)
│       ├── voice.js            (VoiceReaderService — browser speech synthesis, swappable later)
│       └── app.js               (the whole reader SPA: home/discover/detail/access/library/reader/profile)
├── admin/             # CMS — dark interface, gold accent, visually distinct from reader UI
│   ├── index.html
│   ├── css/admin.css
│   └── js/admin.js       (dashboard, books+chapters+cover uploads, genres/tags, products,
│                            orders, entitlements, VIP, readers, comments, reports,
│                            translations, analytics, audit log, media library)
├── uploads/            # uploaded cover images / media (created at runtime)
└── data/                # beersheba.sqlite (created at runtime by npm run seed)
```

---

## 2. What is fully working (tested, not just written)

Everything below was exercised end-to-end against the running server, not
just inspected as code:

- **Auth**: register, login, logout, forgot/reset password, sessions via
  HttpOnly cookies, password hashing (scrypt).
- **Admin protection**: `/admin/*` pages and every `/api/admin/*` route
  reject non-admins **server-side** — verified a reader gets a 302 redirect
  on the page and a 403 on the API, regardless of what the client claims.
- **Entitlement system** (the core business rule): buying "30 Chapters
  Access" creates an `UNUSED` entitlement; consuming it against a book
  makes it `CONSUMED` and permanently tied to that book; a second attempt
  to spend the same entitlement on a different book is rejected server-side
  with a clear error. Verified by direct test.
- **VIP membership**: purchase → VIP entitlement → `/api/me` reports
  `vip: true` → VIP-eligible/exclusive books become readable.
- **Publish validation**: attempting to publish a book with no cover, no
  synopsis, no genre, no chapters, or empty chapter content is rejected
  with the exact itemized issue list the original spec asked for; fixing
  the issues allows publishing.
- **Chapter gating**: free preview chapters are always readable; anything
  beyond that requires sign-in *and* either a matching entitlement or VIP
  access — verified by direct URL/API access attempts, not just hidden UI.
- **Scheduled publishing**: a background tick (every 30s) promotes
  `SCHEDULED` books/chapters to `PUBLISHED` once their time arrives —
  verified with a live 5-second schedule.
- **Cover management**: admin can upload/preview/replace/remove a book
  cover from the book editor (JPG/PNG/WEBP, 5MB client-side limit, 8MB
  server-side limit); the same URL is the single field every surface
  reads (`book.cover_image` → API `cover` field → every card renderer) —
  verified the same uploaded image appears on the book detail, discover
  list, and search results from one upload. Deleting a media asset that's
  still a book's cover is blocked (409) unless explicitly forced.
- **Secure PDF delivery**: PDFs are stored outside the publicly-served
  `/uploads` folder (in `/private-uploads`, which has no static route at
  all) and are only ever reachable through the authorized
  `GET /api/books/:id/pdf` route, which checks VIP access and
  standard-purchase access as *separate* flags — verified a VIP reader who
  merely has a book in their VIP collection is correctly denied a
  standard-only PDF, and a standard purchaser is denied a VIP-only PDF.
  Tested: unauthenticated (401), no entitlement (403), wrong/nonexistent
  book id (404), and confirmed the raw file path itself returns nothing
  useful even if guessed. Every download is logged to `pdf_downloads`.
- **Real Trending / New Releases / Best Sellers**: no more static flags.
  New Releases is a real `published_at` recency window (falls back to the
  admin's editorial flag only for books that are already published).
  Trending is a weighted, time-decayed activity score across bookmarks,
  reading-progress updates, comments, and purchases (see
  `lib/stats.js: getTrendingBooks`). Best Sellers ranks by actual paid
  orders in the last 90 days. All three verified to return an honestly
  empty list rather than fabricated results when there's no qualifying
  activity — confirmed Best Sellers is empty on a fresh seed (the only
  seeded order is a VIP membership, not tied to a specific book).
- **Chapter-end discussions**: comments are scoped to `(book_id,
  chapter_id)`, not merged into one book-wide feed — verified a comment
  posted on Chapter 1 does not appear in Chapter 2's discussion, while the
  book-level comment feed still shows both. This is separate from book
  Reviews (overall opinion) by design.
- **Admin dashboard command centre**: every stat card is a shortcut to the
  relevant filtered view (Drafts → Books filtered to Draft, VIP Members →
  VIP page, etc.), plus a quick-actions bar (+ New Book, Upload Media,
  View Orders/Readers/Comments). Mobile sidebar collapses into a drawer;
  every admin table scrolls horizontally inside its own container instead
  of blowing out the page.
- **Legal/support pages**: `/terms`, `/privacy`, `/cookies`, `/copyright`,
  `/content-guidelines`, `/refunds`, `/about`, `/support`, `/contact` are
  real pages, all linked from the footer. The six legal policies are
  admin-editable (Settings → Legal / Policies: edit/save draft/publish/
  unpublish) and served from the database — nothing is hard-coded into the
  frontend. Registration requires checking a Terms/Privacy acknowledgement
  box. The contact form stores real messages viewable in Settings.
- **Library classification (Purchased vs. VIP Collection vs. Continue
  Reading vs. Completed)**: access source and reading state are tracked as
  fully independent dimensions — a book can legitimately appear in more
  than one tab at once (e.g. purchased AND in-progress). Verified the exact
  6-case matrix (purchased/VIP × never-started/in-progress/completed) via
  the seeded demo account: a never-started purchase appears only in
  Purchased, an in-progress one also appears in Continue Reading, a
  finished one moves to Completed while staying in Purchased — and the
  same three states verified independently for VIP-sourced books. Also
  fixed a real bug where a never-opened book (no reading-progress row at
  all) was incorrectly appearing in Continue Reading at 0% — it now only
  appears there once actually started. Continue Reading's button opens the
  reader at the exact saved chapter, not chapter 1 — verified directly.
  Progress persistence across logout/login re-verified after this fix.
- **Fixed a payment-routing gap**: after a standard purchase, "Go to
  Library" now lands on the Purchased tab; after a VIP purchase, it lands
  on VIP Collection — previously both routed to a generic library view.
- **Live statistics**: homepage reader/story/rating counts and every admin
  dashboard number are computed by SQL queries in `lib/stats.js` — verified
  they change after registering a user, publishing a book, and completing
  a purchase.
- **Bookmarks, reading progress, comments (with replies/likes/reports),
  reviews, "My Library" tabs (continue/purchased/VIP/completed/bookmarks)**:
  all backed by real tables, all tested via API.
- **Account & Profile settings** (`/` → Account, three tabs — Profile,
  Reading Preferences, Account & Security): display name, username
  (uniqueness-checked), bio (HTML-stripped server-side, 280-char limit),
  preferred language, profile photo upload/replace/remove (same media
  pipeline as book covers, single source of truth — verified an uploaded
  avatar immediately appears on a posted comment), email change
  (password-confirmed, duplicate-checked, format-validated), password
  change (invalidates every other session, verified old sessions die and
  old passwords stop working), and reading preferences (font size/family,
  line spacing, width, theme, voice speed) that persist across logout/login.
  Every mutation operates only on the caller's own account — verified
  Reader B's request cannot touch Reader A's profile no matter what's in
  the request body (role injection is silently ignored too). Account
  deletion is intentionally *not* faked — it returns a clear explanation
  of why, rather than pretending to delete anything.
- **Audit log**: every admin mutation (book/chapter create/edit/publish,
  entitlement grants, reader suspension, price changes, etc.) is recorded
  and viewable at `/admin` → Audit Log.
- **Reader settings** (font size, theme) persist to the account and
  survive reload.
- **Voice reader**: real, working browser text-to-speech (Web Speech API)
  with play/pause and chapter text — not a stub, though it depends on
  browser support (Chrome/Edge/Safari support it; noted in UI if missing).

## 3. What is intentionally prototype/stubbed

These are clearly labeled in the UI/API responses, not silently faked:

- **Paystack payments** run in a **DEV SIMULATOR** by default (no
  `PAYSTACK_SECRET_KEY` set) — the full order → pay → verify → entitlement
  flow works, but no real Paystack API is called and no money moves. The
  code path for real Paystack calls exists and is correct
  (`lib/paystack.js`), but this sandbox has no outbound network access to
  test it live. Setting the environment variables switches it on with no
  other code changes.
- **Translation** returns an explicit "not connected in this environment"
  message rather than fake-translating text. `lib/translate.js` defines
  the provider interface; wiring in DeepL/Google Translate is a matter of
  implementing `callProvider()`.
- **Generated audiobook files**: the schema and admin UI
  (`voice_enabled`/`audio_status`: NOT_GENERATED/GENERATING/READY/FAILED)
  are in place, but no TTS generation job runs — today's "Voice Reader" is
  live browser speech synthesis, which is a legitimate feature on its own,
  not a placeholder for the file-based version.
- **Media storage** is local disk (`/uploads`), fine for this environment
  and for small-scale real deployment, but not what you'd use at scale —
  see production notes below.
- **Account deletion** is a documented placeholder (returns HTTP 501 with
  an explanation) rather than a real delete — see `routes/library.js`'s
  `/api/me/delete-account` for why this needs a deliberate product
  decision (anonymize vs. hard-delete, what happens to entitlements tied
  to financial records) before it ships.
- **Email change** applies immediately after a password check, without a
  verification email to the new address — noted directly in the API
  response (`dev: true`) and in `routes/library.js`.
- **Analytics** date-range/product filtering is basic (30-day fixed
  window); the underlying queries already group by day and are
  straightforward to parameterize further.
- **Mobile responsiveness**: CSS fixes were made (table-overflow
  containment, sidebar-drawer collapse, modal viewport clamping,
  `user-select` correctness) but this pass was verified with real HTTP
  requests and DOM/CSS inspection, not an actual rendered-browser
  screenshot audit at each of the 320–1440px breakpoints requested — that
  final visual pass still needs a real browser (or device) check before
  calling mobile "done."

## 4. Known limitations

- `node:sqlite` is still an experimental Node API (stable enough for this
  prototype, but pin your Node version in production or migrate to
  Postgres — see below).
- Single Node process, single SQLite file: fine for a CMS run by one
  publisher; won't horizontally scale as-is.
- No rate limiting / CAPTCHA on registration or login.
- No email delivery — password reset returns the reset link directly in
  the API response (marked `dev: true`) instead of emailing it.
- No CSRF token (relies on `SameSite=Lax` cookies + JSON content-type,
  which blocks the common CSRF vectors but isn't a complete answer).

## 5. Exact next steps for production

1. **Payments**: set `PAYSTACK_SECRET_KEY`/`PAYSTACK_PUBLIC_KEY`; add a
   real Paystack **webhook** endpoint (currently verification is
   client-triggered via `/api/orders/:id/verify` — fine for a demo, but a
   webhook is the reliable source of truth in production) and switch the
   client to Paystack's Inline JS/redirect using `publicKey`/
   `authorizationUrl` already returned by `/api/orders`.
2. **Database**: migrate `lib/db.js` off `node:sqlite` to Postgres (the
   query shapes are plain SQL and translate directly; consider Prisma or
   node-postgres). This also unlocks horizontal scaling.
3. **Media storage**: swap local `/uploads` writes in
   `routes/admin.js`'s upload handler for S3/R2/Cloudinary — the
   `MediaService`-shaped interface (`upload → {id, url}`) is already
   isolated to one function, so this is a contained change.
4. **Email**: add a real provider (Postmark/SES/Resend), require
   verification of the new address before `/api/me/email` applies it, and
   stop returning `resetUrl` directly from `/api/auth/forgot-password`.
5. **Account deletion**: decide a real retention policy (typically:
   anonymize the profile — name/email/avatar — while preserving orders,
   entitlements, and audit rows for accounting/legal reasons) and
   implement it in place of the current 501 placeholder.
6. **Translation & audiobook generation**: implement `callProvider()` in
   `lib/translate.js`; add a job runner that fills `chapters.audio_status`
   and `audio_source` via a TTS provider.
7. **Deployment**: any host that runs a persistent Node process works
   (Railway, Render, a VPS, Fly.io). Serverless platforms (Vercel
   functions) won't work as-is because of the local SQLite file and
   in-process scheduler — either move to Postgres first or run this on a
   persistent container.
8. Add CSRF tokens, rate limiting, and structured logging before taking
   real payments.

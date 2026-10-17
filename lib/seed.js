'use strict';
const db = require('./db');
const { id, slugify } = require('./util');
const { hashPassword } = require('./auth');

function alreadySeeded() {
  const row = db.prepare('SELECT COUNT(*) c FROM products').get();
  return row.c > 0;
}

function upsertGenre(name) {
  const existing = db.prepare('SELECT * FROM genres WHERE name = ?').get(name);
  if (existing) return existing.id;
  const gid = id();
  db.prepare('INSERT INTO genres (id, name, slug) VALUES (?, ?, ?)').run(gid, name, slugify(name));
  return gid;
}

function upsertTag(name) {
  const existing = db.prepare('SELECT * FROM tags WHERE name = ?').get(name);
  if (existing) return existing.id;
  const tid = id();
  db.prepare('INSERT INTO tags (id, name, slug) VALUES (?, ?, ?)').run(tid, name, slugify(name));
  return tid;
}

const CHAPTER_TITLES = [
  'The Beginning', 'A Dangerous Game', 'The Decision', 'The Truth Revealed', 'The Consequences',
  'The Breaking Point', 'A New Beginning', 'Old Wounds', 'The Confrontation', 'No Turning Back',
  'The Confession', 'Shattered Trust', 'What Remains', 'The Offer', 'A Line Crossed',
];

function placeholderChapterContent(bookTitle, chapterNumber, chapterTitle) {
  return [
    `Chapter ${chapterNumber} placeholder content for "${bookTitle}".`,
    `This is seed text standing in for "${chapterTitle}" — replace it with the real manuscript from the chapter editor in Admin → Books → Manage Chapters.`,
    `The reader-facing layout, pacing controls, and access rules are already wired to whatever text lives here, so once real content is pasted in, everything downstream (previews, entitlements, VIP gating, progress tracking) keeps working without further changes.`,
  ].join('\n\n');
}

function seedBook(admin, def) {
  const bookId = id();
  const slug = slugify(def.title);
  db.prepare(
    `INSERT INTO books (
      id, slug, title, subtitle, author, synopsis, short_description, original_language,
      primary_genre_id, cover_image, featured_image, social_image,
      access_tiers, vip_eligible, vip_exclusive, pdf_eligible, free_preview_chapters,
      featured, trending, best_seller, new_release,
      seo_title, meta_description, status, published_at
    ) VALUES (?,?,?,?,?,?,?,?, ?,?,?,?, ?,?,?,?,?, ?,?,?,?, ?,?,?,?)`
  ).run(
    bookId, slug, def.title, def.subtitle || null, def.author || 'Beersheba', def.synopsis, def.shortDescription,
    'English',
    def.primaryGenreId, def.cover || null, def.cover || null, def.cover || null,
    JSON.stringify(def.tiers), def.vipEligible ? 1 : 0, def.vipExclusive ? 1 : 0, def.pdfEligible ? 1 : 0, 1,
    def.featured ? 1 : 0, def.trending ? 1 : 0, def.bestSeller ? 1 : 0, def.newRelease ? 1 : 0,
    def.title, def.shortDescription, 'PUBLISHED', new Date().toISOString()
  );

  def.genreIds.forEach((gid) => {
    db.prepare('INSERT OR IGNORE INTO book_genres (book_id, genre_id) VALUES (?, ?)').run(bookId, gid);
  });
  def.tagIds.forEach((tid) => {
    db.prepare('INSERT OR IGNORE INTO book_tags (book_id, tag_id) VALUES (?, ?)').run(bookId, tid);
  });

  for (let n = 1; n <= def.chapters; n++) {
    const cTitle = CHAPTER_TITLES[(n - 1) % CHAPTER_TITLES.length];
    db.prepare(
      `INSERT INTO chapters (id, book_id, number, order_index, title, content, is_preview, status, published_at)
       VALUES (?,?,?,?,?,?,?, 'PUBLISHED', ?)`
    ).run(id(), bookId, n, n, `${cTitle}`, placeholderChapterContent(def.title, n, cTitle), n === 1 ? 1 : 0, new Date().toISOString());
  }

  return bookId;
}

function run() {
  if (alreadySeeded()) {
    console.log('Already seeded — skipping. Delete data/beersheba.sqlite to reseed from scratch.');
    return;
  }

  console.log('Seeding Beersheba...');

  // --- accounts -----------------------------------------------------------
  const adminId = id();
  db.prepare(
    `INSERT INTO users (id, name, email, password_hash, role, reader_settings) VALUES (?,?,?,?,?,?)`
  ).run(
    adminId, 'Beersheba Publisher', 'admin@beersheba.app', hashPassword('AdminPass123!'), 'ADMIN', null
  );

  const readerId = id();
  db.prepare(
    `INSERT INTO users (id, name, email, password_hash, role, preferred_language, reader_settings) VALUES (?,?,?,?,?,?,?)`
  ).run(
    readerId, 'Annabella Johnson', 'annabella@email.com', hashPassword('ReaderPass123!'), 'READER', 'English',
    JSON.stringify({ fontSize: 'md', fontFamily: 'serif', lineSpacing: 'normal', width: 'normal', theme: 'dark' })
  );

  // --- genres & tags --------------------------------------------------------
  const genreNames = ['Romance', 'Billionaire', 'Werewolf', 'Fantasy', 'Mystery', 'Drama', 'Mafia'];
  const genres = Object.fromEntries(genreNames.map((n) => [n, upsertGenre(n)]));

  const tagNames = [
    'Billionaire', 'Enemies to Lovers', 'Forbidden Love', 'Marriage of Convenience', 'Alpha King',
    'Dark Romance', 'Second Chance', 'Revenge', 'Mafia', 'Fantasy',
  ];
  const tags = Object.fromEntries(tagNames.map((n) => [n, upsertTag(n)]));

  // --- products ---------------------------------------------------------
  const products = [
    { name: '20 Chapters Access', description: 'Unlock one 20-chapter novel of your choice. Read online, track progress.', price: 100, type: 'CHAPTER_ACCESS_20' },
    { name: '30 Chapters Access', description: 'Unlock one 30-chapter novel of your choice. Read online, track progress.', price: 300, type: 'CHAPTER_ACCESS_30' },
    { name: '50 Chapters Access', description: 'Unlock one 50-chapter novel of your choice. Read online, track progress.', price: 500, type: 'CHAPTER_ACCESS_50' },
    { name: 'Lifetime VIP', description: 'Access eligible library, download PDFs, new releases, VIP-only stories, no ads.', price: 3000, type: 'LIFETIME_VIP' },
  ];
  const productIds = {};
  products.forEach((p) => {
    const pid = id();
    productIds[p.type] = pid;
    db.prepare(
      `INSERT INTO products (id, name, description, price_cents, currency, type, active) VALUES (?,?,?,?,?,?,1)`
    ).run(pid, p.name, p.description, p.price, 'USD', p.type);
  });

  // --- books --------------------------------------------------------------
  const defs = [
    {
      title: "The Billionaire's Forbidden Love", author: 'Beersheba',
      synopsis: "A single contract. A dangerous attraction. A love neither of them expected. Isabella never imagined she'd marry a billionaire — especially not one as cold and arrogant as Julian Blackwood. But when her brother's life hangs in the balance, a fake marriage begins, and the lines between duty and desire blur fast.",
      shortDescription: 'She was his greatest temptation. He was her most dangerous secret.',
      genreIds: [genres.Romance, genres.Billionaire], tagIds: [tags.Billionaire, tags['Forbidden Love'], tags['Marriage of Convenience']],
      tiers: ['30'], vipEligible: true, vipExclusive: false, pdfEligible: true, chapters: 30,
      featured: true, trending: true, bestSeller: true, newRelease: false,
    },
    {
      title: "The Alpha King's Claimed Mate", author: 'Beersheba',
      synopsis: 'Kira never asked to be claimed by the most feared Alpha King in the Northern territories. Bound by an ancient mating call neither of them can resist, she must survive palace politics, a rival pack, and a king who guards his heart as fiercely as his throne.',
      shortDescription: 'Fate marked her as his. She refuses to belong to anyone.',
      genreIds: [genres.Romance, genres.Werewolf], tagIds: [tags['Alpha King'], tags.Fantasy],
      tiers: ['50'], vipEligible: true, vipExclusive: false, pdfEligible: true, chapters: 50,
      featured: false, trending: true, bestSeller: false, newRelease: false,
    },
    {
      title: "His Ruthless Obsession", author: 'Beersheba',
      synopsis: 'Everyone warned her to stay away from Damian Cole. She should have listened. What starts as blackmail becomes obsession, and obsession becomes something neither of them can name.',
      shortDescription: 'He was never supposed to want her this much.',
      genreIds: [genres.Romance, genres.Drama], tagIds: [tags['Dark Romance']],
      tiers: ['30'], vipEligible: false, vipExclusive: false, pdfEligible: false, chapters: 30,
      featured: false, trending: false, bestSeller: false, newRelease: false,
    },
    {
      title: "The CEO's Secret Wife", author: 'Beersheba',
      synopsis: "Married in secret, hidden from the world, Elena lives a double life as the unseen wife of the city's most powerful CEO. When the truth threatens to surface, so does everything he's spent years trying to protect.",
      shortDescription: 'The world knows him as untouchable. Only she knows the truth.',
      genreIds: [genres.Romance, genres.Billionaire], tagIds: [tags.Billionaire, tags['Second Chance']],
      tiers: ['30'], vipEligible: true, vipExclusive: false, pdfEligible: true, chapters: 30,
      featured: false, trending: false, bestSeller: true, newRelease: false,
    },
    {
      title: 'Bound to the Shadow Prince', author: 'Beersheba',
      synopsis: 'Cursed to walk between worlds, Prince Ashryn needs a human bride to break the shadow that has consumed his kingdom. Mira never believed in magic — until it chose her.',
      shortDescription: 'A curse only love was ever strong enough to break.',
      genreIds: [genres.Fantasy, genres.Romance], tagIds: [tags.Fantasy, tags['Forbidden Love']],
      tiers: ['30'], vipEligible: true, vipExclusive: true, pdfEligible: true, chapters: 30,
      featured: false, trending: false, bestSeller: false, newRelease: true,
    },
    {
      title: 'Revenge in Red Heels', author: 'Beersheba',
      synopsis: "She lost everything to the Castellano family. Now she's back, richer, sharper, and dangerously close to the one man who never saw her coming: their own heir.",
      shortDescription: 'They ruined her once. She came back to finish it.',
      genreIds: [genres.Romance, genres.Drama], tagIds: [tags.Revenge, tags['Enemies to Lovers']],
      tiers: ['20'], vipEligible: false, vipExclusive: false, pdfEligible: false, chapters: 20,
      featured: false, trending: false, bestSeller: false, newRelease: false,
    },
    {
      title: "The Mafia Don's Innocent Queen", author: 'Beersheba',
      synopsis: 'Sold to settle her father\'s debt, Sofia expected cruelty from Don Vittorio De Luca. She did not expect to become the only person he has ever protected.',
      shortDescription: 'She was payment for a debt. He made her his queen.',
      genreIds: [genres.Mafia, genres.Romance], tagIds: [tags.Mafia, tags['Dark Romance']],
      tiers: ['50'], vipEligible: true, vipExclusive: false, pdfEligible: true, chapters: 50,
      featured: false, trending: false, bestSeller: false, newRelease: false,
    },
    {
      title: "The Dragon King's Bride", author: 'Beersheba',
      synopsis: 'To save her village, Wren must marry a king who is more myth than man — and whose true form has not been seen by a human in three hundred years.',
      shortDescription: 'Every hundred years, the Dragon King takes a bride.',
      genreIds: [genres.Fantasy, genres.Romance], tagIds: [tags.Fantasy, tags['Alpha King']],
      tiers: ['50'], vipEligible: true, vipExclusive: false, pdfEligible: true, chapters: 50,
      featured: false, trending: true, bestSeller: false, newRelease: false,
    },
    {
      title: 'Falling for My Enemy', author: 'Beersheba',
      synopsis: 'Their families have been at war for two generations. Falling in love was never part of the plan — for either of them.',
      shortDescription: 'Two rival houses. One impossible love.',
      genreIds: [genres.Romance, genres.Drama], tagIds: [tags['Enemies to Lovers'], tags['Second Chance']],
      tiers: ['30'], vipEligible: false, vipExclusive: false, pdfEligible: false, chapters: 30,
      featured: false, trending: true, bestSeller: false, newRelease: false,
    },
    {
      title: 'The Broken Princess', author: 'Beersheba',
      synopsis: 'Exiled from her own kingdom and left for dead, Princess Adelina must reclaim her crown with nothing left to lose — and no one left to trust except the man who once betrayed her.',
      shortDescription: 'They took her crown. They never took her fire.',
      genreIds: [genres.Fantasy, genres.Drama], tagIds: [tags.Fantasy, tags.Revenge],
      tiers: ['30'], vipEligible: false, vipExclusive: false, pdfEligible: false, chapters: 30,
      featured: false, trending: false, bestSeller: false, newRelease: false,
    },
  ];

  const bookIds = defs.map((d) => seedBook(adminId, { ...d, primaryGenreId: d.genreIds[0], cover: null }));

  // --- some demo activity so dashboards/library aren't empty on first run --
  const now = () => new Date().toISOString();
  const { grantEntitlement, consumeEntitlement, grantVip, addToLibrary } = require('./access');

  // Annabella is a Lifetime VIP member (matches the approved design mockups)
  const vipOrderId = id();
  db.prepare(
    `INSERT INTO orders (id, user_id, product_id, amount_cents, currency, provider, provider_reference, status, created_at)
     VALUES (?,?,?,?,?,?,?,?,?)`
  ).run(vipOrderId, readerId, productIds.LIFETIME_VIP, 3000, 'USD', 'paystack', 'DEV-SEED-VIP', 'PAID', '2024-04-05T00:00:00.000Z');
  grantVip(readerId, vipOrderId, 'DEV-SEED-VIP');

  // Demo library test matrix — deliberately covers every combination of
  // access source (Purchased vs VIP) x reading state (never started / in
  // progress / completed), so the classification logic is verifiable just
  // by opening the seeded demo account rather than needing to fabricate
  // test data by hand every time.
  function seedStandardPurchase(bookIdx, productType) {
    const orderId = id();
    const priceCents = { CHAPTER_ACCESS_20: 100, CHAPTER_ACCESS_30: 300, CHAPTER_ACCESS_50: 500 }[productType];
    db.prepare(
      `INSERT INTO orders (id, user_id, product_id, amount_cents, currency, provider, provider_reference, status)
       VALUES (?,?,?,?,?, 'paystack', ?, 'PAID')`
    ).run(orderId, readerId, productIds[productType], priceCents, 'USD', `DEV-SEED-${bookIds[bookIdx].slice(0, 8)}`);
    const entId = grantEntitlement(readerId, orderId, productIds[productType], productType);
    consumeEntitlement(readerId, entId, bookIds[bookIdx]);
  }
  function seedProgress(bookIdx, chapter, percent) {
    db.prepare(
      `INSERT INTO reading_progress (user_id, book_id, chapter_number, percent) VALUES (?,?,?,?)`
    ).run(readerId, bookIds[bookIdx], chapter, percent);
  }

  // A — purchased, never started (Purchased tab only)
  seedStandardPurchase(2, 'CHAPTER_ACCESS_30');       // His Ruthless Obsession
  // B — purchased, in progress (Purchased + Continue Reading)
  seedStandardPurchase(5, 'CHAPTER_ACCESS_20');       // Revenge in Red Heels
  seedProgress(5, 5, 25);
  // C — purchased, completed (Purchased + Completed)
  seedStandardPurchase(8, 'CHAPTER_ACCESS_30');       // Falling for My Enemy
  seedProgress(8, 30, 100);
  // D — VIP, never started (VIP Collection only)
  addToLibrary(readerId, bookIds[6], 'VIP');          // The Mafia Don's Innocent Queen
  // E — VIP, in progress (VIP Collection + Continue Reading)
  addToLibrary(readerId, bookIds[0], 'VIP');          // The Billionaire's Forbidden Love
  seedProgress(0, 17, 56);
  // F — VIP, completed (VIP Collection + Completed)
  addToLibrary(readerId, bookIds[3], 'VIP');          // The CEO's Secret Wife
  seedProgress(3, 30, 100);

  db.prepare('INSERT INTO bookmarks (id, user_id, book_id) VALUES (?,?,?)').run(id(), readerId, bookIds[7]);

  // a couple of reviews + comments so counts are non-zero
  db.prepare(
    `INSERT INTO reviews (id, book_id, user_id, rating, body, status) VALUES (?,?,?,?,?,?)`
  ).run(id(), bookIds[0], readerId, 5, 'Could not put this down. Julian is insufferable and I loved every page of it.', 'APPROVED');
  db.prepare(
    `INSERT INTO comments (id, book_id, chapter_id, user_id, body) VALUES (?,?, (SELECT id FROM chapters WHERE book_id = ? AND number = 17), ?, ?)`
  ).run(id(), bookIds[0], bookIds[0], readerId, "I KNEW Julian had a reason! This chapter broke me. Can't wait for the next one!");

  // --- legal/support policy drafts (published so the public pages work out of the box) --
  const today = new Date().toISOString().slice(0, 10);
  const policies = [
    { key: 'terms', title: 'Terms of Service', content:
`Last updated: ${today}

These Terms of Service ("Terms") govern your use of Beersheba (the "Platform"). By creating an account or purchasing access to any story, you agree to these Terms.

1. Accounts. You are responsible for maintaining the confidentiality of your account credentials and for all activity under your account.

2. Access & Entitlements. Beersheba sells one-time chapter-access entitlements and a Lifetime VIP membership. A one-time entitlement unlocks exactly one eligible story of your choice; once you select a story, that choice is final and the entitlement cannot be transferred to a different story.

3. Content. All stories on Beersheba are fictional works. Beersheba retains ownership of the platform and its published content unless otherwise stated.

4. Conduct. You agree not to redistribute, scrape, or resell content accessed through your account, and not to attempt to circumvent access controls.

5. Termination. Beersheba may suspend accounts that violate these Terms.

6. Changes. We may update these Terms from time to time; continued use of the Platform after changes constitutes acceptance.

This is an initial platform policy draft prepared for a prototype product and does not constitute legal advice or a claim of compliance with any specific jurisdiction's laws. An administrator can edit this content at any time from Admin → Settings → Legal / Policies.` },
    { key: 'privacy', title: 'Privacy Policy', content:
`Last updated: ${today}

This Privacy Policy describes what information Beersheba collects and how it is used.

1. Information We Collect. Account information (name, email, username, bio, profile photo), reading activity (library, bookmarks, progress), and payment records (via our payment provider).

2. How We Use It. To provide the reading experience, process purchases, personalize recommendations, and maintain the security of the Platform.

3. What We Don't Do. We do not sell your personal information to third parties.

4. Payment Data. Card details are handled directly by our payment provider (Paystack) and are never stored on Beersheba's own servers.

5. Your Choices. You may update or request changes to your account information at any time from Account Settings.

This is an initial platform policy draft prepared for a prototype product and does not constitute legal advice. An administrator can edit this content at any time from Admin → Settings → Legal / Policies.` },
    { key: 'cookies', title: 'Cookie Policy', content:
`Last updated: ${today}

Beersheba uses a small number of essential cookies to keep you signed in and remember your session. We do not currently use advertising or third-party tracking cookies.

You can control cookies through your browser settings, though disabling essential cookies will prevent you from staying signed in.

This is an initial platform policy draft and does not constitute legal advice.` },
    { key: 'copyright', title: 'Copyright / DMCA Policy', content:
`Last updated: ${today}

All stories published on Beersheba are owned by Beersheba or its contributing authors and are protected by copyright law. Unauthorized reproduction, distribution, or resale of any content is prohibited.

If you believe content on Beersheba infringes your copyright, please contact us via the Support page with a description of the work and the material you believe infringes it.

This is an initial platform policy draft and does not constitute legal advice.` },
    { key: 'content-guidelines', title: 'Content Guidelines', content:
`Last updated: ${today}

Beersheba's community spaces (comments, chapter discussions, reviews) exist for genuine reactions to our stories. Please keep discussion respectful.

Not permitted: harassment, hate speech, spam, spoiler-flooding without warning, or sharing another reader's personal information.

Comments that violate these guidelines may be hidden or removed, and repeat violations may result in account suspension. You can report any comment directly from the discussion thread.` },
    { key: 'refunds', title: 'Refund Policy', content:
`Last updated: ${today}

Because access is granted instantly upon purchase, one-time chapter-access purchases and Lifetime VIP membership are generally non-refundable once the entitlement or VIP status has been activated on your account.

If you experience a genuine technical issue with your purchase (e.g. a failed payment that still charged your card, or an entitlement that never activated), please contact Support with your order reference and we will investigate.

This is an initial platform policy draft and does not constitute legal advice.` },
  ];
  policies.forEach((p) => {
    db.prepare(`INSERT INTO policies (key, title, content, status) VALUES (?,?,?, 'PUBLISHED')`).run(p.key, p.title, p.content);
  });

  console.log('Seed complete.');
  console.log('Admin login: admin@beersheba.app / AdminPass123!');
  console.log('Reader login: annabella@email.com / ReaderPass123!');
}

if (require.main === module) {
  run();
}

module.exports = { run };

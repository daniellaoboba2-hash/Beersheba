'use strict';
const db = require('./db');

function homepageStats() {
  const readers = db.prepare(`SELECT COUNT(*) c FROM users WHERE role = 'READER'`).get().c;
  const stories = db.prepare(`SELECT COUNT(*) c FROM books WHERE status = 'PUBLISHED'`).get().c;
  const reviewAgg = db
    .prepare(`SELECT COUNT(*) c, AVG(rating) avg_rating FROM reviews WHERE status = 'APPROVED'`)
    .get();
  const fiveStar = db
    .prepare(`SELECT COUNT(*) c FROM reviews WHERE status = 'APPROVED' AND rating = 5`)
    .get().c;
  const fiveStarPct = reviewAgg.c > 0 ? Math.round((fiveStar / reviewAgg.c) * 100) : 0;
  return {
    readers,
    stories,
    fiveStarPct,
    averageRating: reviewAgg.avg_rating ? Number(reviewAgg.avg_rating.toFixed(1)) : 0,
    reviewCount: reviewAgg.c,
  };
}

function bookMetrics(bookId) {
  const reviewAgg = db
    .prepare(`SELECT COUNT(*) c, AVG(rating) avg_rating FROM reviews WHERE book_id = ? AND status = 'APPROVED'`)
    .get(bookId);
  const commentCount = db
    .prepare(`SELECT COUNT(*) c FROM comments WHERE book_id = ? AND status = 'VISIBLE'`)
    .get(bookId).c;
  const readers = db.prepare(`SELECT COUNT(DISTINCT user_id) c FROM library_items WHERE book_id = ?`).get(bookId).c;
  return {
    rating: reviewAgg.avg_rating ? Number(reviewAgg.avg_rating.toFixed(1)) : 0,
    reviewCount: reviewAgg.c,
    commentCount,
    readers,
  };
}

function adminDashboard() {
  const books = db.prepare(`SELECT status, COUNT(*) c FROM books GROUP BY status`).all();
  const byStatus = Object.fromEntries(books.map((r) => [r.status, r.c]));
  const totalBooks = Object.values(byStatus).reduce((a, b) => a + b, 0);

  const totalReaders = db.prepare(`SELECT COUNT(*) c FROM users WHERE role = 'READER'`).get().c;
  const newReaders7d = db
    .prepare(`SELECT COUNT(*) c FROM users WHERE role = 'READER' AND created_at >= datetime('now','-7 days')`)
    .get().c;

  const standardPurchases = db
    .prepare(`SELECT COUNT(*) c FROM orders WHERE status = 'PAID' AND product_id IN (SELECT id FROM products WHERE type != 'VIP_MEMBERSHIP')`)
    .get().c;
  const vipMembers = db.prepare(`SELECT COUNT(*) c FROM vip_memberships WHERE status = 'ACTIVE'`).get().c;

  const totalRevenueCents = db.prepare(`SELECT COALESCE(SUM(amount_cents),0) s FROM orders WHERE status = 'PAID'`).get().s;

  const booksRead = db.prepare(`SELECT COUNT(*) c FROM reading_progress`).get().c;
  const pdfDownloads = db.prepare(`SELECT COUNT(*) c FROM pdf_downloads`).get().c;
  const comments = db.prepare(`SELECT COUNT(*) c FROM comments WHERE status = 'VISIBLE'`).get().c;
  const translationRequests = db.prepare(`SELECT COUNT(*) c FROM translations`).get().c;

  const revenueByDay = db
    .prepare(
      `SELECT date(created_at) d, COALESCE(SUM(amount_cents),0) cents FROM orders WHERE status = 'PAID' AND created_at >= datetime('now','-30 days') GROUP BY d ORDER BY d`
    )
    .all();
  const readerGrowthByDay = db
    .prepare(
      `SELECT date(created_at) d, COUNT(*) c FROM users WHERE role = 'READER' AND created_at >= datetime('now','-30 days') GROUP BY d ORDER BY d`
    )
    .all();

  const recentPurchases = db
    .prepare(
      `SELECT o.id, o.amount_cents, o.currency, o.status, o.created_at, u.name as user_name, p.name as product_name
       FROM orders o JOIN users u ON u.id = o.user_id JOIN products p ON p.id = o.product_id
       ORDER BY o.created_at DESC LIMIT 8`
    )
    .all();
  const recentRegistrations = db
    .prepare(`SELECT id, name, email, created_at FROM users WHERE role = 'READER' ORDER BY created_at DESC LIMIT 8`)
    .all();
  const recentComments = db
    .prepare(
      `SELECT c.id, c.body, c.created_at, u.name as user_name, b.title as book_title
       FROM comments c JOIN users u ON u.id = c.user_id JOIN books b ON b.id = c.book_id
       ORDER BY c.created_at DESC LIMIT 8`
    )
    .all();
  const openReports = db.prepare(`SELECT COUNT(*) c FROM comment_reports WHERE status = 'OPEN'`).get().c;

  const mostRead = db
    .prepare(
      `SELECT b.id, b.title, b.cover_image, COUNT(li.id) as readers
       FROM books b LEFT JOIN library_items li ON li.book_id = b.id
       GROUP BY b.id ORDER BY readers DESC LIMIT 5`
    )
    .all();
  const mostPurchased = db
    .prepare(
      `SELECT b.id, b.title, b.cover_image, COUNT(o.id) as purchases
       FROM books b LEFT JOIN orders o ON o.book_id = b.id AND o.status='PAID'
       GROUP BY b.id ORDER BY purchases DESC LIMIT 5`
    )
    .all();

  return {
    totalBooks,
    publishedBooks: byStatus.PUBLISHED || 0,
    draftBooks: byStatus.DRAFT || 0,
    scheduledBooks: byStatus.SCHEDULED || 0,
    totalReaders,
    newReaders7d,
    standardPurchases,
    vipMembers,
    totalRevenue: (totalRevenueCents / 100).toFixed(2),
    booksRead,
    pdfDownloads,
    comments,
    translationRequests,
    openReports,
    revenueByDay,
    readerGrowthByDay,
    recentPurchases,
    recentRegistrations,
    recentComments,
    mostRead,
    mostPurchased,
  };
}

/**
 * NEW RELEASES — driven by real publish dates, not a hand-picked list.
 * Primary signal: published within the last 30 days. An admin's editorial
 * `new_release` flag can also surface a book here, but ONLY once it's
 * actually published — a draft/archived book can never appear regardless
 * of any flag.
 */
function getNewReleases(limit) {
  return db
    .prepare(
      `SELECT * FROM books
       WHERE status = 'PUBLISHED'
         AND (published_at >= datetime('now', '-30 days') OR new_release = 1)
       ORDER BY published_at DESC
       LIMIT ?`
    )
    .all(limit || 20);
}

/**
 * TRENDING — a weighted, time-decayed activity score, not a static list.
 * Recent bookmarks, reading-progress updates, comments, and purchases each
 * contribute, with activity in the last 3 days weighted higher than the
 * last 14 days. Only published books are eligible. The exact weights are a
 * simple, transparent starting point — tune freely in one place.
 */
function getTrendingBooks(limit) {
  const rows = db
    .prepare(
      `SELECT b.*, (
         (SELECT COUNT(*) FROM bookmarks bm WHERE bm.book_id = b.id AND bm.created_at >= datetime('now','-3 days')) * 3 +
         (SELECT COUNT(*) FROM bookmarks bm WHERE bm.book_id = b.id AND bm.created_at >= datetime('now','-14 days')) * 1 +
         (SELECT COUNT(*) FROM reading_progress rp WHERE rp.book_id = b.id AND rp.updated_at >= datetime('now','-3 days')) * 4 +
         (SELECT COUNT(*) FROM reading_progress rp WHERE rp.book_id = b.id AND rp.updated_at >= datetime('now','-14 days')) * 1 +
         (SELECT COUNT(*) FROM comments c WHERE c.book_id = b.id AND c.status='VISIBLE' AND c.created_at >= datetime('now','-14 days')) * 2 +
         (SELECT COUNT(*) FROM orders o WHERE o.book_id = b.id AND o.status='PAID' AND o.created_at >= datetime('now','-14 days')) * 5
       ) AS trend_score
       FROM books b
       WHERE b.status = 'PUBLISHED'
       ORDER BY trend_score DESC, b.published_at DESC
       LIMIT ?`
    )
    .all(limit || 20);
  // Books with genuinely zero recent activity aren't "trending" — better an
  // honest empty/short list than padding it with inactive titles.
  return rows.filter((r) => r.trend_score > 0);
}

/**
 * BEST SELLERS — ranked by actual paid-order volume in the last 90 days,
 * published books only. Falls back to all-time volume only if nothing sold
 * recently, so the section never shows a book that has never sold.
 */
function getBestSellers(limit) {
  const rows = db
    .prepare(
      `SELECT b.*, COUNT(o.id) as purchase_count
       FROM books b JOIN orders o ON o.book_id = b.id AND o.status = 'PAID'
       WHERE b.status = 'PUBLISHED' AND o.created_at >= datetime('now', '-90 days')
       GROUP BY b.id
       ORDER BY purchase_count DESC
       LIMIT ?`
    )
    .all(limit || 20);
  return rows.filter((r) => r.purchase_count > 0);
}

module.exports = { homepageStats, bookMetrics, adminDashboard, getNewReleases, getTrendingBooks, getBestSellers };

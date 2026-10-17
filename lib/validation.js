'use strict';
const db = require('./db');

function validateBookForPublish(book) {
  const issues = [];
  if (!book.title || !book.title.trim()) issues.push('Title is missing.');
  if (!book.cover_image) issues.push('Cover image is missing.');
  if (!book.synopsis || !book.synopsis.trim()) issues.push('Synopsis is missing.');

  const genreLink = db.prepare('SELECT 1 FROM book_genres WHERE book_id = ?').get(book.id);
  if (!genreLink) issues.push('Primary genre has not been set.');

  const chapters = db.prepare('SELECT * FROM chapters WHERE book_id = ? ORDER BY order_index').all(book.id);
  if (chapters.length === 0) {
    issues.push('At least one chapter is required.');
  } else {
    // chapter numbering validity: sequential positive integers, no duplicates
    const numbers = chapters.map((c) => c.number).sort((a, b) => a - b);
    for (let i = 0; i < numbers.length; i++) {
      if (numbers[i] !== i + 1) {
        issues.push('Chapter numbering is not sequential starting at 1.');
        break;
      }
    }
    chapters.forEach((c) => {
      if (!c.content || !c.content.trim()) {
        issues.push(`Chapter ${c.number} has no content.`);
      }
    });
  }

  const tiers = JSON.parse(book.access_tiers || '[]');
  if (tiers.length === 0 && !book.vip_exclusive) {
    issues.push('Access configuration has not been set (choose at least one chapter-access tier, or mark VIP-exclusive).');
  }

  return { valid: issues.length === 0, issues };
}

module.exports = { validateBookForPublish };

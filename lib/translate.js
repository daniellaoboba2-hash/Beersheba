'use strict';
const db = require('./db');
const { id } = require('./util');

// Swap this for a real provider (DeepL, Google Cloud Translate, etc.) by
// implementing the same (text, targetLanguage) -> Promise<string> shape and
// pointing TRANSLATE_PROVIDER at it. No caller-side code needs to change.
async function callProvider(text, targetLanguage) {
  const apiKey = process.env.TRANSLATE_API_KEY;
  if (!apiKey) {
    // No provider configured in this environment (and this sandbox has no
    // network access to test one anyway). We return the original text with a
    // clear marker rather than pretending to translate it.
    throw new Error('NO_PROVIDER_CONFIGURED');
  }
  // Real implementation would call the provider's HTTPS API here, e.g.:
  //   const resp = await fetch(`https://api.deepl.com/v2/translate`, {...});
  throw new Error('NOT_IMPLEMENTED');
}

/**
 * Request (and cache) a translation for a chapter or comment. Canonical
 * content is NEVER modified — translations always live in their own table,
 * keyed by (content_type, content_id, language).
 */
async function translate(contentType, contentId, language, sourceText) {
  const existing = db
    .prepare(`SELECT * FROM translations WHERE content_type=? AND content_id=? AND language=?`)
    .get(contentType, contentId, language);
  if (existing && existing.status === 'READY') return existing;

  const recordId = existing ? existing.id : id();
  if (!existing) {
    db.prepare(
      `INSERT INTO translations (id, content_type, content_id, language, status) VALUES (?, ?, ?, ?, 'PENDING')`
    ).run(recordId, contentType, contentId, language);
  }

  try {
    const translated = await callProvider(sourceText, language);
    db.prepare(`UPDATE translations SET status='READY', translated_text=? WHERE id=?`).run(translated, recordId);
    return db.prepare('SELECT * FROM translations WHERE id = ?').get(recordId);
  } catch (e) {
    db.prepare(`UPDATE translations SET status='FAILED' WHERE id=?`).run(recordId);
    return db.prepare('SELECT * FROM translations WHERE id = ?').get(recordId);
  }
}

module.exports = { translate };

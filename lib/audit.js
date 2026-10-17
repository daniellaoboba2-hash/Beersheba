'use strict';
const db = require('./db');
const { id } = require('./util');

function logAction(adminId, action, entity, entityId, metadata) {
  db.prepare(
    `INSERT INTO audit_logs (id, admin_id, action, entity, entity_id, metadata) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id(), adminId || null, action, entity || null, entityId || null, metadata ? JSON.stringify(metadata) : null);
}

module.exports = { logAction };

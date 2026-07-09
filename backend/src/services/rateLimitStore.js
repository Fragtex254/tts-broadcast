const db = require('../db');

function normalizePositiveInt(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function prune({ scope, beforeMs }) {
  db.prepare('DELETE FROM api_rate_limit_events WHERE scope = ? AND started_at_ms <= ?')
    .run(scope, beforeMs);
}

function getWindow({ scope, sinceMs }) {
  return db.prepare(`
    SELECT started_at_ms, request_cost, token_cost, payload_cost
    FROM api_rate_limit_events
    WHERE scope = ? AND started_at_ms > ?
    ORDER BY started_at_ms ASC, id ASC
  `).all(scope, sinceMs);
}

function recordStart({ scope, startedAtMs, requestCost = 1, tokenCost = 1, payloadCost = 0 }) {
  db.prepare(`
    INSERT INTO api_rate_limit_events (scope, started_at_ms, request_cost, token_cost, payload_cost)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    scope,
    startedAtMs,
    normalizePositiveInt(requestCost, 1),
    normalizePositiveInt(tokenCost, 1),
    normalizePositiveInt(payloadCost, 0)
  );
}

function getBackoffUntil(scope) {
  const row = db.prepare('SELECT backoff_until_ms FROM api_rate_limit_state WHERE scope = ?').get(scope);
  return normalizePositiveInt(row?.backoff_until_ms, 0);
}

function setBackoffUntil({ scope, backoffUntilMs }) {
  db.prepare(`
    INSERT INTO api_rate_limit_state (scope, backoff_until_ms, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(scope) DO UPDATE SET
      backoff_until_ms = max(api_rate_limit_state.backoff_until_ms, excluded.backoff_until_ms),
      updated_at = CURRENT_TIMESTAMP
  `).run(scope, normalizePositiveInt(backoffUntilMs, 0));
}

function clearScope(scope) {
  db.prepare('DELETE FROM api_rate_limit_events WHERE scope = ?').run(scope);
  db.prepare('DELETE FROM api_rate_limit_state WHERE scope = ?').run(scope);
}

module.exports = {
  prune,
  getWindow,
  recordStart,
  getBackoffUntil,
  setBackoffUntil,
  clearScope,
};

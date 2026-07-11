const db = require('../db');

function normalizePositiveInt(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function prune({ scope, beforeMs }) {
  db.prepare('DELETE FROM api_rate_limit_events WHERE scope = ? AND started_at_ms <= ?')
    .run(scope, beforeMs);
}

function getWindow({ scope, sinceMs, untilMs = Date.now() + 1000 }) {
  return db.prepare(`
    SELECT started_at_ms, request_cost, token_cost, payload_cost
    FROM api_rate_limit_events
    WHERE scope = ? AND started_at_ms > ? AND started_at_ms <= ?
    ORDER BY started_at_ms ASC, id ASC
  `).all(scope, sinceMs, untilMs);
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

function getState(scope) {
  const row = db.prepare(`
    SELECT backoff_until_ms, adaptive_concurrency_limit, adaptive_concurrency_ceiling,
           last_rate_limit_at_ms,
           circuit_until_ms, circuit_reason
    FROM api_rate_limit_state
    WHERE scope = ?
  `).get(scope);
  return {
    backoffUntilMs: normalizePositiveInt(row?.backoff_until_ms, 0),
    adaptiveConcurrencyLimit: normalizePositiveInt(row?.adaptive_concurrency_limit, 0),
    adaptiveConcurrencyCeiling: normalizePositiveInt(row?.adaptive_concurrency_ceiling, 0),
    lastRateLimitAtMs: normalizePositiveInt(row?.last_rate_limit_at_ms, 0),
    circuitUntilMs: normalizePositiveInt(row?.circuit_until_ms, 0),
    circuitReason: typeof row?.circuit_reason === 'string' ? row.circuit_reason : '',
  };
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

function setAdaptiveConcurrency({
  scope,
  concurrencyLimit,
  concurrencyCeiling = 0,
  lastRateLimitAtMs = 0,
}) {
  const incomingLimit = normalizePositiveInt(concurrencyLimit, 0);
  const incomingCeiling = normalizePositiveInt(concurrencyCeiling, 0);
  const incomingRateLimitAt = normalizePositiveInt(lastRateLimitAtMs, 0);
  const update = db.transaction(() => {
    const existing = getState(scope);
    if (incomingRateLimitAt < existing.lastRateLimitAtMs) return;

    let nextCeiling;
    if (existing.adaptiveConcurrencyCeiling > 0 && incomingCeiling > 0) {
      nextCeiling = Math.min(existing.adaptiveConcurrencyCeiling, incomingCeiling);
    } else {
      nextCeiling = existing.adaptiveConcurrencyCeiling || incomingCeiling;
    }
    const nextLimit = nextCeiling > 0 ? Math.min(incomingLimit, nextCeiling) : incomingLimit;

    db.prepare(`
      INSERT INTO api_rate_limit_state (
        scope, adaptive_concurrency_limit, adaptive_concurrency_ceiling,
        last_rate_limit_at_ms, updated_at
      ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(scope) DO UPDATE SET
        adaptive_concurrency_limit = excluded.adaptive_concurrency_limit,
        adaptive_concurrency_ceiling = excluded.adaptive_concurrency_ceiling,
        last_rate_limit_at_ms = excluded.last_rate_limit_at_ms,
        updated_at = CURRENT_TIMESTAMP
    `).run(scope, nextLimit, nextCeiling, incomingRateLimitAt);
  });
  update.immediate();
}

function setCircuit({ scope, circuitUntilMs, circuitReason = '', observedUntilMs }) {
  if (circuitUntilMs <= 0 && observedUntilMs !== undefined) {
    const result = db.prepare(`
      UPDATE api_rate_limit_state
      SET circuit_until_ms = 0, circuit_reason = '', updated_at = CURRENT_TIMESTAMP
      WHERE scope = ? AND circuit_until_ms <= ?
    `).run(scope, normalizePositiveInt(observedUntilMs, 0));
    return result.changes > 0;
  }
  db.prepare(`
    INSERT INTO api_rate_limit_state (
      scope, circuit_until_ms, circuit_reason, updated_at
    ) VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(scope) DO UPDATE SET
      circuit_until_ms = max(api_rate_limit_state.circuit_until_ms, excluded.circuit_until_ms),
      circuit_reason = CASE
        WHEN excluded.circuit_until_ms >= api_rate_limit_state.circuit_until_ms
          THEN excluded.circuit_reason
        ELSE api_rate_limit_state.circuit_reason
      END,
      updated_at = CURRENT_TIMESTAMP
  `).run(
    scope,
    normalizePositiveInt(circuitUntilMs, 0),
    typeof circuitReason === 'string' ? circuitReason : ''
  );
  return true;
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
  getState,
  setBackoffUntil,
  setAdaptiveConcurrency,
  setCircuit,
  clearScope,
};

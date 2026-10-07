import crypto from "node:crypto";

function fail(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

export function readIdempotency(database, request, propertyId, scope) {
  const key = String(request.get("idempotency-key") || "").trim();
  if (!key || key.length > 128) throw fail("A valid Idempotency-Key header is required.");
  const requestHash = crypto.createHash("sha256")
    .update(JSON.stringify(request.body || {}))
    .digest("hex");
  const existing = database.prepare(`
    SELECT request_hash, response_json FROM api_idempotency_keys
    WHERE property_id = ? AND user_id = ? AND scope = ? AND idempotency_key = ?
  `).get(propertyId, request.user.id, scope, key);
  if (existing && existing.request_hash !== requestHash) {
    throw fail("This Idempotency-Key was already used for a different request.", 409);
  }
  return {
    key,
    requestHash,
    response: existing ? JSON.parse(existing.response_json) : null,
  };
}

export function saveIdempotency(database, request, propertyId, scope, record, response) {
  database.prepare(`
    INSERT INTO api_idempotency_keys (
      property_id, user_id, scope, idempotency_key, request_hash, response_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(propertyId, request.user.id, scope, record.key, record.requestHash, JSON.stringify(response));
}
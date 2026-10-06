import crypto from "node:crypto";

const sessionCookie = "boms_session";
const sessionDurationMs = 12 * 60 * 60 * 1000;
const loginAttempts = new Map();

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password, storedHash) {
  const [algorithm, salt, expectedHex] = String(storedHash || "").split("$");
  if (algorithm !== "scrypt" || !salt || !/^[a-f\d]{128}$/i.test(expectedHex || "")) return false;
  const expected = Buffer.from(expectedHex, "hex");
  const actual = crypto.scryptSync(password, salt, expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

function readCookie(request, name) {
  const cookieHeader = request.get("cookie") || "";
  const cookie = cookieHeader.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return cookie ? decodeURIComponent(cookie.slice(name.length + 1)) : "";
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function findSessionUser(database, propertyId, token) {
  if (!token) return null;
  return database.prepare(`
    SELECT users.id, users.name, users.email, users.role
    FROM auth_sessions
    JOIN users ON users.id = auth_sessions.user_id AND users.property_id = auth_sessions.property_id
    WHERE auth_sessions.property_id = ? AND auth_sessions.token_hash = ?
      AND auth_sessions.expires_at > CURRENT_TIMESTAMP AND users.active = 1 AND users.deleted_at IS NULL
  `).get(propertyId, hashToken(token)) || null;
}

export function requireAuthenticatedUser(database, propertyId) {
  return (request, response, next) => {
    const requestPath = request.path || "";
    if (requestPath === "/health" || requestPath.startsWith("/auth/")) return next();
    const user = findSessionUser(database, propertyId, readCookie(request, sessionCookie));
    if (!user) return response.status(401).json({ error: "Sign in to continue." });
    request.user = user;
    next();
  };
}

function setSessionCookie(response, request, token, maxAge) {
  const secure = request.secure || request.get("x-forwarded-proto") === "https";
  response.setHeader("Set-Cookie", `${sessionCookie}=${encodeURIComponent(token)}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? "; Secure" : ""}`);
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function applyRoleFiltering(database, propertyId, user) {
  if (user.role === "worker") {
    database.prepare(`
      UPDATE notifications SET read_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE property_id = ? AND user_id = ? AND type = 'finance_summary' AND read_at IS NULL
    `).run(propertyId, user.id);
  }
}

export function registerAuthRoutes(app, database, propertyId) {
  app.post("/api/auth/login", (request, response) => {
    const email = normalizeEmail(request.body.email);
    const password = String(request.body.password || "");
    const ipAddress = request.ip || "local";
    const now = Date.now();
    const attempts = loginAttempts.get(ipAddress) || { count: 0, startedAt: now };
    if (now - attempts.startedAt > 15 * 60 * 1000) {
      attempts.count = 0;
      attempts.startedAt = now;
    }
    if (attempts.count >= 8) return response.status(429).json({ error: "Too many sign-in attempts. Try again in 15 minutes." });

    const user = database.prepare(`
      SELECT id, name, email, role, password_hash FROM users
      WHERE property_id = ? AND lower(email) = ? AND active = 1 AND deleted_at IS NULL
    `).get(propertyId, email);
    if (!user?.password_hash || !verifyPassword(password, user.password_hash)) {
      attempts.count += 1;
      loginAttempts.set(ipAddress, attempts);
      return response.status(401).json({ error: "Email or password is incorrect." });
    }
    loginAttempts.delete(ipAddress);
    const token = crypto.randomBytes(32).toString("base64url");
    const expiresAt = new Date(now + sessionDurationMs).toISOString().replace("T", " ").slice(0, 19);
    database.prepare("INSERT INTO auth_sessions (id, property_id, user_id, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(`SES-${crypto.randomUUID()}`, propertyId, user.id, hashToken(token), new Date(now).toISOString(), expiresAt);
    database.prepare("UPDATE users SET last_login = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(user.id);
    applyRoleFiltering(database, propertyId, user);
    setSessionCookie(response, request, token, Math.floor(sessionDurationMs / 1000));
    response.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  });

  app.get("/api/auth/me", (request, response) => {
    const user = findSessionUser(database, propertyId, readCookie(request, sessionCookie));
    if (!user) return response.status(401).json({ error: "Sign in to continue." });
    applyRoleFiltering(database, propertyId, user);
    response.json({ user });
  });

  app.post("/api/auth/logout", (request, response) => {
    const token = readCookie(request, sessionCookie);
    if (token) database.prepare("DELETE FROM auth_sessions WHERE property_id = ? AND token_hash = ?").run(propertyId, hashToken(token));
    setSessionCookie(response, request, "", 0);
    response.status(204).end();
  });

  app.get("/api/notifications", (request, response) => {
    const notifications = database.prepare(`
      SELECT id, type, title, body, read_at, created_at
      FROM notifications WHERE property_id = ? AND (user_id = ? OR user_id IS NULL)
        AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 100
    `).all(propertyId, request.user.id).map((notification) => ({
      ...notification,
      read: Boolean(notification.read_at),
      itemId: notification.type.startsWith("low_stock:") ? notification.type.slice("low_stock:".length) : "",
    }));
    response.json(notifications);
  });

  app.patch("/api/notifications/:id/read", (request, response) => {
    const result = database.prepare(`
      UPDATE notifications SET read_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND property_id = ? AND (user_id = ? OR user_id IS NULL) AND deleted_at IS NULL
    `).run(request.params.id, propertyId, request.user.id);
    if (!result.changes) return response.status(404).json({ error: "Notification not found." });
    response.json({ id: request.params.id, read: true });
  });
}

export function createAuthMiddleware(database, propertyId) {
  return requireAuthenticatedUser(database, propertyId);
}
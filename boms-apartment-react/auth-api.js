import crypto from "node:crypto";

const sessionCookie = "boms_session";
const sessionDurationMs = 12 * 60 * 60 * 1000;

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

async function findSessionUser(database, propertyId, token) {
  if (!token) return null;
  return database.get(`
    SELECT users.id, users.name, users.email, users.role
    FROM auth_sessions
    JOIN users ON users.id = auth_sessions.user_id AND users.property_id = auth_sessions.property_id
    WHERE auth_sessions.property_id = ? AND auth_sessions.token_hash = ?
      AND auth_sessions.expires_at > CURRENT_TIMESTAMP AND users.active = 1 AND users.deleted_at IS NULL
  `, [propertyId, hashToken(token)]) || null;
}

export function requireAuthenticatedUser(database, propertyId) {
  return async (request, response, next) => {
    const requestPath = request.path || "";
    if (requestPath === "/health" || requestPath.startsWith("/auth/")) return next();
    try {
      const user = await findSessionUser(database, propertyId, readCookie(request, sessionCookie));
      if (!user) return response.status(401).json({ error: "Sign in to continue." });
      request.user = user;
      next();
    } catch (error) {
      next(error);
    }
  };
}

function setSessionCookie(response, request, token, maxAge) {
  const secure = request.secure || request.get("x-forwarded-proto") === "https";
  response.setHeader("Set-Cookie", `${sessionCookie}=${encodeURIComponent(token)}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? "; Secure" : ""}`);
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

async function applyRoleFiltering(database, propertyId, user) {
  if (user.role === "worker") {
    await database.run(`
      UPDATE notifications SET read_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE property_id = ? AND user_id = ? AND type = 'finance_summary' AND read_at IS NULL
    `, [propertyId, user.id]);
  }
}

export function registerAuthRoutes(app, database, propertyId) {
  app.post("/api/auth/login", async (request, response) => {
    const email = normalizeEmail(request.body.email);
    const password = String(request.body.password || "");
    const now = Date.now();
    const user = await database.get(`
      SELECT id, name, email, role, password_hash FROM users
      WHERE property_id = ? AND lower(email) = ? AND active = 1 AND deleted_at IS NULL
    `, [propertyId, email]);
    if (!user || password.length > 1024 || !verifyPassword(password, user.password_hash)) {
      return response.status(401).json({ error: "Invalid username or password." });
    }

    const token = crypto.randomBytes(32).toString("base64url");
    const expiresAt = new Date(now + sessionDurationMs).toISOString().replace("T", " ").slice(0, 19);
    await database.run("INSERT INTO auth_sessions (id, property_id, user_id, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)",
      [`SES-${crypto.randomUUID()}`, propertyId, user.id, hashToken(token), new Date(now).toISOString(), expiresAt]);
    await database.run("UPDATE users SET last_login = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [user.id]);
    await applyRoleFiltering(database, propertyId, user);
    setSessionCookie(response, request, token, Math.floor(sessionDurationMs / 1000));
    response.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  });

  app.get("/api/auth/me", async (request, response) => {
    const user = await findSessionUser(database, propertyId, readCookie(request, sessionCookie));
    if (!user) return response.status(401).json({ error: "Sign in to continue." });
    await applyRoleFiltering(database, propertyId, user);
    response.json({ user });
  });

  app.post("/api/auth/logout", async (request, response) => {
    const token = readCookie(request, sessionCookie);
    if (token) await database.run("DELETE FROM auth_sessions WHERE property_id = ? AND token_hash = ?", [propertyId, hashToken(token)]);
    setSessionCookie(response, request, "", 0);
    response.status(204).end();
  });

  app.get("/api/notifications", async (request, response) => {
    const notifications = (await database.all(`
      SELECT id, type, title, body, read_at, created_at
      FROM notifications WHERE property_id = ? AND (user_id = ? OR user_id IS NULL)
        AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 100
    `, [propertyId, request.user.id])).map((notification) => ({
      ...notification,
      read: Boolean(notification.read_at),
      itemId: notification.type.startsWith("low_stock:") ? notification.type.slice("low_stock:".length) : "",
    }));
    response.json(notifications);
  });

  app.patch("/api/notifications/:id/read", async (request, response) => {
    const result = await database.run(`
      UPDATE notifications SET read_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND property_id = ? AND (user_id = ? OR user_id IS NULL) AND deleted_at IS NULL
    `, [request.params.id, propertyId, request.user.id]);
    if (!result.changes) return response.status(404).json({ error: "Notification not found." });
    response.json({ id: request.params.id, read: true });
  });
}

export function createAuthMiddleware(database, propertyId) {
  return requireAuthenticatedUser(database, propertyId);
}
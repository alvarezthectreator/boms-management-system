import crypto from "node:crypto";
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import pg from "pg";
import { hashPassword } from "../auth-api.js";

const { Pool } = pg;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const databasePath = path.resolve(process.env.BOMS_DB_PATH || path.join(root, "data", "boms.sqlite"));
const postgresMode = Boolean(process.env.DATABASE_URL);
const database = postgresMode ? new Pool({ connectionString: process.env.DATABASE_URL }) : new Database(databasePath);
const rl = readline.createInterface({ input: stdin, output: stdout });

function readHidden(prompt) {
  return new Promise((resolve) => {
    stdout.write(prompt);
    stdin.setRawMode?.(true);
    let value = "";
    const onData = (chunk) => {
      const key = chunk.toString();
      if (key === "\u0003") process.exit(1);
      if (key === "\r" || key === "\n") {
        stdin.setRawMode?.(false);
        stdin.off("data", onData);
        stdout.write("\n");
        resolve(value);
      } else if (key === "\u007f" || key === "\b") {
        value = value.slice(0, -1);
      } else if (key >= " ") {
        value += key;
      }
    };
    stdin.on("data", onData);
  });
}

try {
  const name = (await rl.question("Manager name: ")).trim();
  const email = (await rl.question("Manager email: ")).trim().toLowerCase();
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Enter a name and valid email address.");
  }

  const existing = postgresMode
    ? (await database.query("SELECT id, role FROM users WHERE property_id = $1 AND lower(email) = $2 AND deleted_at IS NULL", ["property_boms", email])).rows[0]
    : database.prepare("SELECT id, role FROM users WHERE property_id = ? AND lower(email) = ? AND deleted_at IS NULL").get("property_boms", email);
  if (existing && existing.role !== "manager") {
    throw new Error("That email already belongs to a non-manager account.");
  }

  const password = await readHidden("Manager password (minimum 12 characters): ");
  if (password.length < 12) throw new Error("Password must be at least 12 characters.");
  const passwordHash = hashPassword(password);
  const userId = existing?.id || `USR-${crypto.randomUUID()}`;

  if (postgresMode) {
    if (existing) {
      await database.query("UPDATE users SET name = $1, password_hash = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3", [name, passwordHash, userId]);
    } else {
      await database.query("INSERT INTO users (id, property_id, name, email, role, password_hash, active, created_at, updated_at) VALUES ($1, $2, $3, $4, 'manager', $5, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)", [userId, "property_boms", name, email, passwordHash]);
    }
    await database.query("DELETE FROM auth_sessions WHERE user_id = $1", [userId]);
  } else {
    if (existing) {
      database.prepare("UPDATE users SET name = ?, password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(name, passwordHash, userId);
    } else {
      database.prepare("INSERT INTO users (id, property_id, name, email, role, password_hash, active, created_at, updated_at) VALUES (?, ?, ?, ?, 'manager', ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)").run(userId, "property_boms", name, email, passwordHash);
    }
    database.prepare("DELETE FROM auth_sessions WHERE user_id = ?").run(userId);
  }

  console.log(`Manager account ready for ${email}. Sign in at http://localhost:5173/.`);
} finally {
  rl.close();
  if (postgresMode) await database.end();
  else database.close();
}
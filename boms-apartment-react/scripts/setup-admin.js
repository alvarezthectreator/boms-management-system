import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { hashPassword } from "../auth-api.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const databasePath = path.resolve(process.env.BOMS_DB_PATH || path.join(root, "data", "boms.sqlite"));
const database = new Database(databasePath);
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
  const email = (await rl.question("CEO email: ")).trim().toLowerCase();
  const users = database.prepare("SELECT id, name, email FROM users WHERE property_id = 'property_boms' AND role = 'ceo' AND active = 1 AND deleted_at IS NULL").all();
  let user = users.find((candidate) => candidate.email.toLowerCase() === email);
  if (!user && users.length === 1 && !users[0].email) user = users[0];
  if (!user) throw new Error("No active CEO account matches that email. Create/seed the CEO account before setup.");
  const password = await readHidden("New password (minimum 12 characters): ");
  if (password.length < 12) throw new Error("Password must be at least 12 characters.");
  database.prepare("UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(hashPassword(password), user.id);
  database.prepare("DELETE FROM auth_sessions WHERE user_id = ?").run(user.id);
  console.log(`Password set for ${user.email}. Sign in at http://localhost:5173/.`);
} finally {
  rl.close();
  database.close();
}
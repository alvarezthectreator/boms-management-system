import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import { backupDatabase, restoreDatabase } from "../scripts/db-tools.js";

test("SQLite backup verifies and restore keeps a pre-restore copy", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "boms-db-test-"));
  const livePath = path.join(directory, "live.sqlite");
  const backupPath = path.join(directory, "backup.sqlite");
  const backupDirectory = path.join(directory, "backups");
  const live = new Database(livePath);
  live.exec("CREATE TABLE values_table (value TEXT); INSERT INTO values_table VALUES ('before');");
  live.close();

  await backupDatabase(livePath, backupPath);
  const source = new Database(backupPath);
  source.prepare("UPDATE values_table SET value = 'restored'").run();
  source.close();

  await assert.rejects(restoreDatabase(backupPath, livePath, { backupDirectory }), /pass --yes/);
  const result = await restoreDatabase(backupPath, livePath, { confirm: true, backupDirectory });
  const restored = new Database(livePath, { readonly: true });
  assert.equal(restored.prepare("SELECT value FROM values_table").get().value, "restored");
  restored.close();
  assert.ok(result.preRestoreBackup);
  const previous = new Database(result.preRestoreBackup, { readonly: true });
  assert.equal(previous.prepare("SELECT value FROM values_table").get().value, "before");
  previous.close();
  fs.rmSync(directory, { recursive: true, force: true });
});
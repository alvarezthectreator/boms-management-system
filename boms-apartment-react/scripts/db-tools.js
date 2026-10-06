import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import Database from "better-sqlite3";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const defaultDatabasePath = path.resolve(process.env.BOMS_DB_PATH || path.join(root, "data", "boms.sqlite"));
export const defaultBackupDirectory = path.resolve(process.env.BOMS_BACKUP_DIR || path.join(root, "data", "backups"));

function assertIntegrity(databasePath) {
  const database = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    const result = database.pragma("quick_check");
    if (result.length !== 1 || result[0].quick_check !== "ok") {
      throw new Error(`SQLite integrity check failed for ${databasePath}.`);
    }
  } finally {
    database.close();
  }
}

function timestamp() {
  return new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
}

export async function backupDatabase(sourcePath = defaultDatabasePath, destinationPath) {
  const source = path.resolve(sourcePath);
  const destination = path.resolve(destinationPath || path.join(defaultBackupDirectory, `boms-${timestamp()}.sqlite`));
  if (source === destination) throw new Error("Backup destination must differ from the live database.");
  if (fs.existsSync(destination)) throw new Error(`Backup already exists: ${destination}`);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const database = new Database(source, { readonly: true, fileMustExist: true });
  try {
    await database.backup(destination);
  } catch (error) {
    fs.rmSync(destination, { force: true });
    throw error;
  } finally {
    database.close();
  }
  assertIntegrity(destination);
  return destination;
}

export async function restoreDatabase(sourcePath, targetPath = defaultDatabasePath, { confirm = false, backupDirectory = defaultBackupDirectory } = {}) {
  const source = path.resolve(sourcePath || "");
  const target = path.resolve(targetPath);
  if (!confirm) throw new Error("Restore is destructive; pass --yes after stopping the app and verifying the backup.");
  if (!sourcePath || !fs.existsSync(source)) throw new Error(`Backup file does not exist: ${source}`);
  if (source === target) throw new Error("Restore source and database target must differ.");
  assertIntegrity(source);

  fs.mkdirSync(path.dirname(target), { recursive: true });
  let preRestoreBackup = null;
  if (fs.existsSync(target)) {
    preRestoreBackup = await backupDatabase(target, path.join(backupDirectory, `pre-restore-${timestamp()}.sqlite`));
  }

  const restored = new Database(source, { readonly: true, fileMustExist: true });
  try {
    await restored.backup(target);
    assertIntegrity(target);
  } catch (error) {
    if (preRestoreBackup) {
      const previous = new Database(preRestoreBackup, { readonly: true, fileMustExist: true });
      try {
        await previous.backup(target);
      } finally {
        previous.close();
      }
    }
    throw new Error(`Restore failed${preRestoreBackup ? `; previous database is backed up at ${preRestoreBackup}` : ""}: ${error.message}`);
  } finally {
    restored.close();
  }
  return { databasePath: target, preRestoreBackup };
}

async function runCli() {
  const [command, ...args] = process.argv.slice(2);
  if (command === "backup") {
    const destination = await backupDatabase(defaultDatabasePath, args[0]);
    console.log(`Verified SQLite backup: ${destination}`);
    return;
  }
  if (command === "restore") {
    const source = args.find((argument) => !argument.startsWith("--"));
    const result = await restoreDatabase(source, defaultDatabasePath, { confirm: args.includes("--yes") });
    console.log(`Restored database: ${result.databasePath}`);
    if (result.preRestoreBackup) console.log(`Pre-restore backup: ${result.preRestoreBackup}`);
    return;
  }
  throw new Error("Usage: node scripts/db-tools.js backup [destination] | restore <backup> --yes");
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runCli().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
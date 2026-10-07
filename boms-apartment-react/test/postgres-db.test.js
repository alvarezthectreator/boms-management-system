import assert from "node:assert/strict";
import test from "node:test";
import { convertPlaceholders, normalizePostgresSql } from "../postgres-db.js";

test("Postgres placeholder conversion ignores quoted text and comments", () => {
  const sql = "SELECT ?, '?', \"?\" -- ?\nFROM items WHERE note = ? /* ? */";
  assert.equal(
    convertPlaceholders(sql),
    "SELECT $1, '?', \"?\" -- ?\nFROM items WHERE note = $2 /* ? */",
  );
});

test("Postgres placeholder conversion handles escaped quotes", () => {
  assert.equal(convertPlaceholders("SELECT 'it''s ?', ?"), "SELECT 'it''s ?', $1");
});

test("Postgres SQL normalization preserves ignored inserts and common SQLite date/math forms", () => {
  assert.equal(
    normalizePostgresSql("INSERT OR IGNORE INTO settings (value) VALUES (?)"),
    "INSERT INTO settings (value) VALUES (?) ON CONFLICT DO NOTHING",
  );
  assert.equal(normalizePostgresSql("SELECT date('now'), max(0, amount) FROM invoices"),
    "SELECT CURRENT_DATE, GREATEST(0, amount) FROM invoices");
});
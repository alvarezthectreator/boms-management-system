import pg from "pg";

const { Pool } = pg;

export function convertPlaceholders(sql) {
  let output = "";
  let parameter = 0;
  let quote = "";
  let lineComment = false;
  let blockComment = false;

  for (let index = 0; index < sql.length; index += 1) {
    const character = sql[index];
    const next = sql[index + 1];

    if (lineComment) {
      output += character;
      if (character === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      output += character;
      if (character === "*" && next === "/") {
        output += next;
        index += 1;
        blockComment = false;
      }
      continue;
    }
    if (quote) {
      output += character;
      if (character === quote && next === quote) {
        output += next;
        index += 1;
      } else if (character === quote && sql[index - 1] !== "\\") {
        quote = "";
      }
      continue;
    }
    if (character === "-" && next === "-") {
      output += "--";
      index += 1;
      lineComment = true;
    } else if (character === "/" && next === "*") {
      output += "/*";
      index += 1;
      blockComment = true;
    } else if (["'", '"'].includes(character)) {
      output += character;
      quote = character;
    } else if (character === "?") {
      parameter += 1;
      output += `$${parameter}`;
    } else {
      output += character;
    }
  }

  return output;
}

export function normalizePostgresSql(sql) {
  const ignoresConflicts = /^\s*INSERT\s+OR\s+IGNORE\s+INTO\b/i.test(sql);
  let normalized = sql
    .replace(/^\s*INSERT\s+OR\s+IGNORE\s+INTO\b/i, (match) => match.replace(/OR\s+IGNORE\s+/i, ""))
    .replace(/\bdate\s*\(\s*'now'\s*\)/gi, "CURRENT_DATE")
    .replace(/\bmax\s*\(\s*0\s*,/gi, "GREATEST(0,");
  if (ignoresConflicts && !/\bON\s+CONFLICT\b/i.test(normalized)) {
    const hasSemicolon = normalized.trimEnd().endsWith(";");
    normalized = `${normalized.trimEnd().replace(/;$/, "")} ON CONFLICT DO NOTHING${hasSemicolon ? ";" : ""}`;
  }
  return normalized;
}

export function createPostgresDatabase(pool) {
  async function queryWith(client, sql, values = []) {
    return client.query(convertPlaceholders(normalizePostgresSql(sql)), values);
  }

  function prepareWith(client, sql) {
    return {
      get: (...values) => queryWith(client, sql, values).then((result) => result.rows[0]),
      all: (...values) => queryWith(client, sql, values).then((result) => result.rows),
      run: (...values) => queryWith(client, sql, values).then((result) => ({ changes: result.rowCount })),
    };
  }

  const database = {
    prepare(sql) {
      return prepareWith(pool, sql);
    },
    async query(sql, values = []) {
      return queryWith(pool, sql, values);
    },
    async get(sql, values = []) {
      const result = await queryWith(pool, sql, values);
      return result.rows[0];
    },
    async all(sql, values = []) {
      const result = await queryWith(pool, sql, values);
      return result.rows;
    },
    async run(sql, values = []) {
      const result = await queryWith(pool, sql, values);
      return { changes: result.rowCount };
    },
    async withTransaction(callback) {
      const client = await pool.connect();
      const transaction = {
        prepare: (sql) => prepareWith(client, sql),
        query: (sql, values = []) => queryWith(client, sql, values),
        async getForUpdate(sql, values = []) {
          const result = await queryWith(client, `${sql.trim().replace(/;$/, "")} FOR UPDATE`, values);
          return result.rows[0];
        },
        async get(sql, values = []) {
          const result = await queryWith(client, sql, values);
          return result.rows[0];
        },
        async all(sql, values = []) {
          const result = await queryWith(client, sql, values);
          return result.rows;
        },
        async run(sql, values = []) {
          const result = await queryWith(client, sql, values);
          return { changes: result.rowCount };
        },
      };

      try {
        await client.query("BEGIN");
        const result = await callback(transaction);
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    transaction(callback) {
      return database.withTransaction(callback);
    },
    async close() {
      await pool.end();
    },
  };

  return database;
}

export function createPostgresPool(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) throw new Error("DATABASE_URL must be configured for PostgreSQL.");
  return new Pool({
    connectionString,
    max: Number(process.env.PG_POOL_MAX || 3),
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });
}
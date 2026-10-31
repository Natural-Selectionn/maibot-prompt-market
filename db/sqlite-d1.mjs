import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

/** A small D1 compatibility boundary for the existing SQL and Drizzle queries. */
export function openSqliteD1(filename) {
  const path = filename === ":memory:" ? filename : resolve(filename);
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const sqlite = new DatabaseSync(path);
  sqlite.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");

  const parameters = values => values.map(value => value === undefined ? null : typeof value === "boolean" ? Number(value) : value);

  class Prepared {
    constructor(sql, values = []) {
      this.sql = sql;
      this.values = parameters(values);
    }
    bind(...values) { return new Prepared(this.sql, values); }
    execute() {
      const statement = sqlite.prepare(this.sql);
      const returnsRows = statement.columns().length > 0;
      let results = [];
      let changes = 0;
      let lastRowId = 0;
      if (returnsRows) {
        results = statement.all(...this.values);
      } else {
        const info = statement.run(...this.values);
        changes = Number(info.changes);
        lastRowId = Number(info.lastInsertRowid);
      }
      return { success: true, results, meta: { changes, last_row_id: lastRowId, duration: 0 } };
    }
    async run() { return this.execute(); }
    async all() { return this.execute(); }
    async first(column) {
      const row = sqlite.prepare(this.sql).get(...this.values);
      return row ? (column === undefined ? row : row[column]) : null;
    }
    async raw() {
      const statement = sqlite.prepare(this.sql);
      // Positional rows preserve duplicate names from joins and RETURNING.
      statement.setReturnArrays(true);
      return statement.all(...this.values);
    }
  }

  return {
    prepare(sql) { return new Prepared(sql); },
    async batch(statements) {
      // No await within the transaction: another request cannot interleave.
      sqlite.exec("BEGIN IMMEDIATE");
      try {
        const results = statements.map(statement => statement.execute());
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
    close() { sqlite.close(); },
  };
}

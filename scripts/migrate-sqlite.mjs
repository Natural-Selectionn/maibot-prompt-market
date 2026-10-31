import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const filename = resolve(process.env.MAIBOT_DATABASE_PATH ?? "./data/maibot.sqlite");
mkdirSync(dirname(filename), { recursive: true, mode: 0o700 });
const db = new DatabaseSync(filename);
try {
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  db.exec("CREATE TABLE IF NOT EXISTS _vps_migrations (name TEXT PRIMARY KEY, sha256 TEXT NOT NULL, applied_at TEXT NOT NULL)");
  for (const name of readdirSync("drizzle").filter(name => /^\d+_.+\.sql$/.test(name)).sort()) {
    const sql = readFileSync(resolve("drizzle", name), "utf8");
    const hash = createHash("sha256").update(sql).digest("hex");
    const applied = db.prepare("SELECT sha256 FROM _vps_migrations WHERE name = ?").get(name);
    if (applied) {
      if (applied.sha256 !== hash) throw new Error(`Applied migration changed: ${name}`);
      continue;
    }
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(sql);
      db.prepare("INSERT INTO _vps_migrations VALUES (?, ?, ?)").run(name, hash, new Date().toISOString());
      db.exec("COMMIT");
      console.log(`Applied ${name}`);
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
  console.log("SQLite migrations are current.");
} finally {
  db.close();
}

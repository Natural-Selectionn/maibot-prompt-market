// Prepare an existing local standalone build; no archive, credentials or deploy.
import { cpSync, lstatSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const stage = resolve(".next/standalone");
if (!existsSync(resolve(stage, "server.js"))) throw new Error("Run npm run build:vps first.");
if (lstatSync(resolve(stage, "node_modules")).isSymbolicLink()) throw new Error("Standalone dependencies must be independent.");
for (const name of ["public", "drizzle", "db/sqlite-d1.mjs", "scripts/migrate-sqlite.mjs", "scripts/moderation-worker.mjs", "lib/moderation-core.mjs", "lib/moderation-store.mjs", "lib/moderation-queue.mjs", "lib/moderation-scheduler.mjs", "lib/admin-policy.mjs", "lib/version-range.mjs"]) {
  cpSync(resolve(name), resolve(stage, name), { recursive: true });
}
cpSync(resolve(".next/static"), resolve(stage, ".next/static"), { recursive: true });
console.log("Local standalone preview prepared.");

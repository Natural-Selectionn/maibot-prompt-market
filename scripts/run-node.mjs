// Standalone Node runtime. All paths are relative to this checkout, not its caller.
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const root = fileURLToPath(new URL("../", import.meta.url));
const localEnv = resolve(root, ".env.local");
if (existsSync(localEnv)) process.loadEnvFile(localEnv);
const [command, ...args] = process.argv.slice(2);
const entries = {
  dev: [resolve(root, "node_modules/next/dist/bin/next"), "dev", "--webpack", "--hostname", process.env.HOSTNAME || "127.0.0.1", "--port", process.env.PORT || "3000"],
  start: [resolve(root, ".next/standalone/server.js")],
  worker: [resolve(root, "scripts/moderation-worker.mjs")],
  migrate: [resolve(root, "scripts/migrate-sqlite.mjs")],
};
if (!Object.hasOwn(entries, command)) throw new Error("Expected dev, start, worker or migrate.");
if (command === "start" && !existsSync(entries.start[0])) throw new Error("Run npm run build first.");
const child = spawn(process.execPath, [...entries[command], ...args], {
  cwd: command === "start" ? dirname(entries.start[0]) : root,
  stdio: "inherit",
  env: {
    ...process.env,
    MAIBOT_RUNTIME: "vps",
    MAIBOT_DATABASE_PATH: resolve(root, process.env.MAIBOT_DATABASE_PATH || "data/maibot.sqlite"),
    AUTH_URL: process.env.AUTH_URL || "http://127.0.0.1:3000",
    HOSTNAME: process.env.HOSTNAME || "127.0.0.1",
    PORT: process.env.PORT || "3000",
    NEXT_TELEMETRY_DISABLED: "1",
  },
});
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => child.kill(signal));
child.once("error", error => { console.error(error.message); process.exitCode = 1; });
child.once("exit", (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); });

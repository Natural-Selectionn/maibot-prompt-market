import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

if (!process.env.npm_execpath) {
  throw new Error("Run this installer with npm run install:ci.");
}

// Invoke npm's JavaScript entrypoint, avoiding platform-specific shell shims.
const root = fileURLToPath(new URL("../", import.meta.url));
const result = spawnSync(process.execPath, [
  process.env.npm_execpath, "ci", "--prefix", root, "--workspaces=false",
  "--include=dev", "--include=optional", "--prefer-offline", "--no-audit", "--no-fund",
], { cwd: root, stdio: "inherit", env: process.env });
if (result.error) throw result.error;
process.exit(result.status ?? 1);

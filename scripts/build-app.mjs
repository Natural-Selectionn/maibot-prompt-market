import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
for (const entry of ["build-vps.mjs", "prepare-local-preview.mjs"]) {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL(entry, import.meta.url))], {
    cwd: root, stdio: "inherit", env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

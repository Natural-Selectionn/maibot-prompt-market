// Inspect only publishable files. Never print a matching secret or file body.
import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const files = [...new Set(execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
  cwd: root, encoding: "utf8",
}).split("\0").filter(Boolean))];
const forbiddenPath = /(?:^|\/)(?:node_modules|\.git|\.next|dist|outputs|backups|data|\.wrangler|\.sites-runtime)(?:\/|$)|(?:^|\/)\.env(?!\.example$)[^/]*$|\.(?:sqlite(?:-wal|-shm)?|db|pem|key|p12|pfx|zip|tar|gz)$/i;
const patterns = [
  ["private-key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----\r?\n[A-Za-z0-9+/=\r\n]{80,}/],
  ["github-token", /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/],
  ["google-secret", /\bGOCSPX-[A-Za-z0-9_-]{20,}\b/],
  ["api-key", /\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{32,}|re_[A-Za-z0-9]{30,}|AKIA[A-Z0-9]{16})\b/],
  ["hosting-project", /\bappgprj_[a-f0-9]{16,}\b/],
  ["credential-url", /https?:\/\/[^\s/@:]+:[^\s/@]+@[^\s"'<>)]*/],
];
const internalRecordPath = /^(?:PROJECT\.md$|docs\/(?:tasks|archives)(?:\/|$)|\.local-notes(?:\/|$))/i;
const issues = [];
for (const file of files) {
  if (/(?:^|\/)AGENTS\.md$/i.test(file)) issues.push(`${file}: local-instructions`);
  if (internalRecordPath.test(file)) issues.push(`${file}: internal-record`);
  if (forbiddenPath.test(file)) issues.push(`${file}: forbidden-path`);
  const path = new URL(`../${file}`, import.meta.url);
  let stat;
  try { stat = lstatSync(path); } catch { issues.push(`${file}: missing-file`); continue; }
  if (stat.isSymbolicLink()) { issues.push(`${file}: symbolic-link`); continue; }
  if (!stat.isFile() || /\.(?:ttf|woff2?|png|jpe?g|ico|webp)$/i.test(file)) continue;
  const source = readFileSync(path, "utf8");
  for (const [name, pattern] of patterns) if (pattern.test(source)) issues.push(`${file}: ${name}`);
}
if (issues.length) {
  console.error(issues.join("\n"));
  process.exitCode = 1;
} else console.log(`Source check passed: ${files.length} files; no blocked paths or recognized credentials.`);

// One-time recovery/initialization through trusted server access, never HTTP.
import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";

const tag = process.argv[2];
if (!tag || !/^\d{1,10}$/.test(tag)) throw new Error("Usage: node scripts/bootstrap-admin.mjs <account-number>");
if (!process.env.MAIBOT_DATABASE_PATH) throw new Error("Set MAIBOT_DATABASE_PATH explicitly.");
const db = new DatabaseSync(resolve(process.env.MAIBOT_DATABASE_PATH));
try {
  db.exec("PRAGMA busy_timeout = 5000; BEGIN IMMEDIATE");
  const target = db.prepare("SELECT id, user_id, role, disabled FROM user_profiles WHERE id = ?").get(Number(tag));
  if (!target || target.disabled) throw new Error("Account missing or disabled.");
  if (target.role === "admin") {
    db.exec("COMMIT");
    console.log(`Account #${String(target.id).padStart(4, "0")} is already an administrator.`);
  } else {
    if (db.prepare("SELECT count(*) AS count FROM user_profiles WHERE role = 'admin' AND disabled = 0").get().count) throw new Error("An active administrator exists; use the panel to grant additional administrators.");
    const now = new Date().toISOString();
    db.prepare("UPDATE user_profiles SET role = 'admin', updated_at = ? WHERE id = ?").run(now, target.id);
    db.prepare("INSERT INTO admin_audit (id, actor_id, action, target_id, created_at) VALUES (?, 'server:bootstrap', 'account:bootstrap-admin', ?, ?)").run(crypto.randomUUID(), String(target.id), now);
    db.exec("COMMIT");
    console.log(`Account #${String(target.id).padStart(4, "0")} is now an administrator.`);
  }
} catch (error) {
  if (db.isTransaction) db.exec("ROLLBACK");
  throw error;
} finally { db.close(); }

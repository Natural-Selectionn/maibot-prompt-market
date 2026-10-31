import { PRIMARY_ADMIN_ACCOUNT_ID } from "./admin-policy.mjs";
import { validatePrompt } from "./prompts.ts";
import { versionRangeStorage } from "./version-range.mjs";

// All mutations recheck the actor inside the same atomic batch as the write.
// Public responses never include login identities, sessions, or internal user IDs.
const activeAdmin = "EXISTS (SELECT 1 FROM user_profiles actor WHERE actor.user_id = ? AND actor.role = 'admin' AND actor.disabled = 0)";
const pageSize = 20;
const page = value => Math.max(0, Math.min(100000, Number.parseInt(value, 10) || 0));
const publicAccount = row => ({ accountTag: String(row.id).padStart(4, "0"), displayName: row.display_name, role: row.role, disabled: !!row.disabled, worksCount: row.works_count, providers: row.providers ? row.providers.split(",") : [] });
const publicAnnouncement = row => ({ id: row.id, title: row.title, body: row.body, published: !!row.published, createdAt: row.created_at, updatedAt: row.updated_at });

export function createAdminStore(db) {
  const first = (sql, ...values) => db.prepare(sql).bind(...values).first();
  const audit = (actor, action, target) => db.prepare("INSERT INTO admin_audit (id, actor_id, action, target_id, created_at) SELECT ?, ?, ?, ?, ? WHERE changes() > 0").bind(crypto.randomUUID(), actor, action, String(target), new Date().toISOString());
  async function requireAdmin(actor) {
    const profile = await first("SELECT id FROM user_profiles WHERE user_id = ? AND role = 'admin' AND disabled = 0", actor);
    if (!profile) throw new Error("forbidden");
    return profile;
  }
  return {
    async accounts(actor, query = "", offset = 0) {
      await requireAdmin(actor);
      const term = `%${query.trim().slice(0, 80).replace(/[\\%_]/g, "\\$&")}%`;
      const { results } = await db.prepare(`SELECT p.id, p.display_name, p.role, p.disabled,
        (SELECT count(*) FROM prompts WHERE owner_id = p.user_id) AS works_count,
        (SELECT group_concat(provider) FROM auth_identities WHERE user_id = p.user_id) AS providers
        FROM user_profiles p WHERE (p.display_name LIKE ? ESCAPE '\\' OR printf('%04d', p.id) LIKE ? ESCAPE '\\') AND ${activeAdmin}
        ORDER BY p.id LIMIT ? OFFSET ?`).bind(term, term, actor, pageSize + 1, page(offset)).all();
      return { items: results.slice(0, pageSize).map(publicAccount), hasMore: results.length > pageSize };
    },
    async updateAccount(actor, tag, payload) {
      const actorProfile = await requireAdmin(actor);
      if (!/^\d{1,10}$/.test(tag) || !payload || typeof payload !== "object" || Array.isArray(payload) ||
        !["role", "disabled"].some(key => Object.hasOwn(payload, key)) ||
        Object.keys(payload).some(key => !["role", "disabled"].includes(key)) ||
        (payload.role !== undefined && !["user", "admin"].includes(payload.role)) ||
        (payload.disabled !== undefined && typeof payload.disabled !== "boolean")) throw new Error("invalid_account");
      const target = await first("SELECT * FROM user_profiles WHERE id = ?", Number(tag));
      if (!target) throw new Error("not_found");
      const managesAdmins = actorProfile.id === PRIMARY_ADMIN_ACCOUNT_ID;
      if (!managesAdmins && (Object.hasOwn(payload, "role") || target.role === "admin" || target.id === PRIMARY_ADMIN_ACCOUNT_ID)) throw new Error("admin_management_forbidden");
      const role = payload.role ?? target.role;
      const disabled = Number(payload.disabled ?? !!target.disabled);
      if (target.id === PRIMARY_ADMIN_ACCOUNT_ID && (role !== "admin" || disabled)) throw new Error("primary_admin_protected");
      const results = await db.batch([
        db.prepare(`UPDATE user_profiles SET role = ?, disabled = ?, updated_at = ? WHERE id = ? AND role = ? AND disabled = ? AND ${activeAdmin}
          AND (EXISTS (SELECT 1 FROM user_profiles manager WHERE manager.user_id = ? AND manager.id = ${PRIMARY_ADMIN_ACCOUNT_ID} AND manager.role = 'admin' AND manager.disabled = 0) OR (? = 0 AND role <> 'admin' AND id <> ${PRIMARY_ADMIN_ACCOUNT_ID}))
          AND (id <> ${PRIMARY_ADMIN_ACCOUNT_ID} OR (? = 'admin' AND ? = 0))
          AND (role <> 'admin' OR disabled = 1 OR (? = 'admin' AND ? = 0) OR (SELECT count(*) FROM user_profiles WHERE role = 'admin' AND disabled = 0) > 1)`)
          .bind(role, disabled, new Date().toISOString(), target.id, target.role, target.disabled, actor, actor, Number(Object.hasOwn(payload, "role")), role, disabled, role, disabled),
        audit(actor, `account:${role}:${disabled ? "disabled" : "active"}`, target.id),
        db.prepare("DELETE FROM auth_sessions WHERE user_id = ? AND EXISTS (SELECT 1 FROM user_profiles WHERE user_id = ? AND disabled = 1)").bind(target.user_id, target.user_id),
        db.prepare("DELETE FROM test_sessions WHERE user_id = ? AND EXISTS (SELECT 1 FROM user_profiles WHERE user_id = ? AND disabled = 1)").bind(target.user_id, target.user_id),
      ]);
      if (!results[0].meta.changes) throw new Error("last_admin_or_forbidden");
    },
    async works(actor, query = "", offset = 0) {
      await requireAdmin(actor);
      const term = `%${query.trim().slice(0, 80).replace(/[\\%_]/g, "\\$&")}%`;
      const { results } = await db.prepare(`SELECT p.id, p.title, p.kind, p.created_at, coalesce(u.display_name, p.author) AS author, u.id AS account_number
        FROM prompts p LEFT JOIN user_profiles u ON u.user_id = p.owner_id
        WHERE (p.title LIKE ? ESCAPE '\\' OR p.author LIKE ? ESCAPE '\\' OR u.display_name LIKE ? ESCAPE '\\' OR printf('%04d', u.id) LIKE ? ESCAPE '\\') AND ${activeAdmin}
        ORDER BY p.created_at DESC, p.id LIMIT ? OFFSET ?`).bind(term, term, term, term, actor, pageSize + 1, page(offset)).all();
      return { items: results.slice(0, pageSize).map(row => ({ id: row.id, title: row.title, kind: row.kind, author: row.author, accountTag: row.account_number ? String(row.account_number).padStart(4, "0") : "", createdAt: row.created_at })), hasMore: results.length > pageSize };
    },
    async updateWork(actor, id, payload) {
      await requireAdmin(actor);
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("invalid_json");
      const existing = await first("SELECT kind, author, created_at, updated_at FROM prompts WHERE id = ?", id);
      if (!existing) throw new Error("not_found");
      if (payload.kind !== undefined && payload.kind !== existing.kind) throw new Error("invalid_work_kind");
      if (typeof payload.revision !== "string" || payload.revision.length > 40 || !Number.isFinite(Date.parse(payload.revision))) throw new Error("invalid_work_revision");
      if (payload.revision !== (existing.updated_at ?? existing.created_at)) throw new Error("work_conflict");
      const { data, error } = validatePrompt({ ...payload, kind: existing.kind, author: existing.author });
      if (!data) throw Object.assign(new Error("invalid_work"), { detail: error });
      const range = versionRangeStorage(data);
      const updatedAt = new Date(Math.max(Date.now(), Date.parse(payload.revision) + 1)).toISOString();
      // Preserve ownership, author and publication date. Manual admin corrections
      // are published directly, with the permission/revision guard and audit atomic.
      const result = await db.batch([
        db.prepare(`UPDATE prompts SET title = ?, description = ?, category = ?, scene = ?, min_version = ?, max_version = ?, min_version_key = ?, max_version_key = ?, tags = ?, fields = ?, template_name = ?, template_locale = ?, template_content = ?, template_files = ?, template_basis = ?, updated_at = ?
          WHERE id = ? AND kind = ? AND coalesce(updated_at, created_at) = ? AND ${activeAdmin}`)
          .bind(data.title, data.description, data.category, data.scene, data.minVersion, data.maxVersion, range.minVersionKey, range.maxVersionKey,
            JSON.stringify(data.tags), JSON.stringify(data.fields), data.templateName ?? "", data.templateLocale ?? "", data.templateContent ?? "",
            JSON.stringify(data.templateFiles ?? []), data.templateBasis ?? "unverified", updatedAt, id, existing.kind, payload.revision, actor),
        audit(actor, "work:update", id),
      ]);
      if (!result[0].meta.changes) throw new Error("work_conflict");
      return { id, updatedAt };
    },
    async deleteWork(actor, id) {
      await requireAdmin(actor);
      const guard = `EXISTS (SELECT 1 FROM prompts WHERE id = ?) AND ${activeAdmin}`;
      const result = await db.batch([
        db.prepare(`DELETE FROM prompt_comments WHERE prompt_id = ? AND ${guard}`).bind(id, id, actor),
        db.prepare(`DELETE FROM prompt_ratings WHERE prompt_id = ? AND ${guard}`).bind(id, id, actor),
        db.prepare(`DELETE FROM prompts WHERE id = ? AND ${activeAdmin}`).bind(id, actor),
        audit(actor, "work:delete", id),
      ]);
      if (!result[2].meta.changes) throw new Error("not_found");
    },
    /** @param {string|null} actor */
    async announcements(actor = null, offset = 0) {
      if (actor) await requireAdmin(actor);
      const { results } = await db.prepare(`SELECT id, title, body, published, created_at, updated_at FROM announcements
        WHERE ${actor ? activeAdmin : "published = 1"} ORDER BY created_at DESC, id LIMIT ? OFFSET ?`)
        .bind(...(actor ? [actor] : []), pageSize + 1, page(offset)).all();
      return { items: results.slice(0, pageSize).map(publicAnnouncement), hasMore: results.length > pageSize };
    },
    /** @param {string} actor @param {any} payload @param {string|null} id */
    async saveAnnouncement(actor, payload, id = null) {
      await requireAdmin(actor);
      if (!payload || typeof payload !== "object" || Array.isArray(payload) || typeof payload.title !== "string" ||
        !payload.title.trim() || payload.title.trim().length > 80 || /[\u0000-\u001f\u007f]/.test(payload.title) ||
        typeof payload.body !== "string" || !payload.body.trim() || payload.body.trim().length > 10000 ||
        typeof payload.published !== "boolean") throw new Error("invalid_announcement");
      const title = payload.title.trim(), body = payload.body.trim(), published = Number(payload.published);
      const key = id ?? crypto.randomUUID();
      // A revision prevents one browser from overwriting another admin's edit.
      if (id && (typeof payload.revision !== "string" || payload.revision.length > 40 || !Number.isFinite(Date.parse(payload.revision)))) throw new Error("invalid_revision");
      const now = new Date(Math.max(Date.now(), id ? Date.parse(payload.revision) + 1 : 0)).toISOString();
      const write = id ? db.prepare(`UPDATE announcements SET title = ?, body = ?, published = ?, updated_at = ? WHERE id = ? AND updated_at = ? AND ${activeAdmin}`)
        .bind(title, body, published, now, id, payload.revision, actor) :
        db.prepare(`INSERT INTO announcements (id, title, body, published, author_id, created_at, updated_at) SELECT ?, ?, ?, ?, ?, ?, ? WHERE ${activeAdmin}`)
          .bind(key, title, body, published, actor, now, now, actor);
      const results = await db.batch([write, audit(actor, id ? "announcement:update" : "announcement:create", key)]);
      if (!results[0].meta.changes) throw new Error("conflict_or_forbidden");
      return publicAnnouncement(await first("SELECT * FROM announcements WHERE id = ?", key));
    },
  };
}

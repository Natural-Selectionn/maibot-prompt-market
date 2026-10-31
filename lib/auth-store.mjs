// Keep account resolution and uniqueness in the database. Provider tokens and
// OAuth emails are not persisted. Explicitly verified email identities are
// stored separately and never used to merge an OAuth account automatically.
export function createAuthStore(db) {
  const first = async (sql, ...values) => (await db.prepare(sql).bind(...values).all()).results[0] ?? null;
  const profileName = value => String(value || "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 24) || "麦麦用户";
  return {
    async saveFlow(flow) {
      await db.prepare("DELETE FROM oauth_flows WHERE expires_at <= ?").bind(Date.now()).run();
      const count = await first("SELECT count(*) AS count FROM oauth_flows");
      if (count.count >= 10000) throw new Error("flow_limit");
      await db.prepare("INSERT INTO oauth_flows (state_hash, provider, code_verifier, nonce, return_to, link_user_id, link_session_hash, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(flow.stateHash, flow.provider, flow.codeVerifier, flow.nonce, flow.returnTo, flow.linkUserId, flow.linkSessionHash, flow.expiresAt).run();
    },
    async takeFlow(hash, provider, now) {
      const row = await first("DELETE FROM oauth_flows WHERE state_hash = ? AND provider = ? AND expires_at > ? RETURNING *", hash, provider, now);
      return row ? { stateHash: row.state_hash, provider: row.provider, codeVerifier: row.code_verifier, nonce: row.nonce, returnTo: row.return_to, linkUserId: row.link_user_id, linkSessionHash: row.link_session_hash, expiresAt: row.expires_at } : null;
    },
    async resolveIdentity(identity, linkUserId) {
      if (!identity.subject || identity.subject.length > 255) throw new Error("invalid_identity");
      const existing = await first("SELECT i.user_id, p.disabled FROM auth_identities i JOIN user_profiles p ON p.user_id = i.user_id WHERE i.provider = ? AND i.subject = ?", identity.provider, identity.subject);
      if (existing) {
        if (existing.disabled) throw new Error("account_disabled");
        if (linkUserId && existing.user_id !== linkUserId) throw new Error("identity_conflict");
        return existing.user_id;
      }
      const now = new Date().toISOString();
      if (linkUserId) {
        if (!await first("SELECT user_id FROM user_profiles WHERE user_id = ? AND disabled = 0", linkUserId)) throw new Error("link_expired");
        try {
          await db.prepare("INSERT INTO auth_identities (provider, subject, user_id, created_at) VALUES (?, ?, ?, ?)").bind(identity.provider, identity.subject, linkUserId, now).run();
        } catch {
          const winner = await first("SELECT user_id FROM auth_identities WHERE provider = ? AND subject = ?", identity.provider, identity.subject);
          if (winner?.user_id !== linkUserId) throw new Error("identity_conflict");
        }
        return linkUserId;
      }
      const userId = `user:${crypto.randomUUID()}`;
      const name = profileName(identity.displayName);
      const key = name.normalize("NFKC").toLocaleLowerCase();
      try {
        await db.batch([
          db.prepare("INSERT INTO user_profiles (user_id, display_name, name_key, updated_at) VALUES (?, ?, ?, ?)").bind(userId, name, key, now),
          db.prepare("UPDATE user_profiles SET disambiguated = 1 WHERE name_key = ? AND (SELECT count(*) FROM user_profiles WHERE name_key = ?) > 1").bind(key, key),
          db.prepare("INSERT INTO auth_identities (provider, subject, user_id, created_at) VALUES (?, ?, ?, ?)").bind(identity.provider, identity.subject, userId, now),
        ]);
        return userId;
      } catch (error) {
        const winner = await first("SELECT user_id FROM auth_identities WHERE provider = ? AND subject = ?", identity.provider, identity.subject);
        if (winner) return winner.user_id;
        throw error;
      }
    },
    async createSession(hash, userId, expiresAt) {
      await db.prepare("DELETE FROM auth_sessions WHERE expires_at <= ?").bind(Date.now()).run();
      const result = await db.prepare("INSERT INTO auth_sessions (token_hash, user_id, expires_at) SELECT ?, ?, ? WHERE EXISTS (SELECT 1 FROM user_profiles WHERE user_id = ? AND disabled = 0)").bind(hash, userId, expiresAt, userId).run();
      if (!result.meta.changes) throw new Error("account_disabled");
    },
    async session(hash, now) {
      const row = await first("SELECT s.user_id, s.expires_at FROM auth_sessions s JOIN user_profiles p ON p.user_id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ? AND p.disabled = 0", hash, now);
      return row ? { userId: row.user_id, expiresAt: row.expires_at } : null;
    },
    async revokeSession(hash) {
      await db.prepare("DELETE FROM auth_sessions WHERE token_hash = ?").bind(hash).run();
    },
    async linkedProviders(userId) {
      return (await db.prepare("SELECT provider FROM auth_identities WHERE user_id = ? ORDER BY provider").bind(userId).all()).results.map(row => row.provider);
    },
  };
}

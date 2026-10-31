// All quota reservations are in one database transaction, including concurrent
// requests from different browsers. Only keyed hashes of IPs are persisted.
export function createEmailStore(db) {
  const first = async (sql, ...values) => (await db.prepare(sql).bind(...values).all()).results[0] ?? null;
  const decode = row => row ? {
    id: row.id, email: row.email, purpose: row.purpose, codeHash: row.code_hash, browserHash: row.browser_hash,
    displayName: row.display_name, returnTo: row.return_to, linkUserId: row.link_user_id,
    linkSessionHash: row.link_session_hash, attempts: row.attempts, createdAt: row.created_at, expiresAt: row.expires_at,
  } : null;
  return {
    async reserve(challenge, limits) {
      const now = challenge.createdAt;
      const guards = limits.map(() => "(key = ? AND ((reset_at > ? AND count >= ?) OR last_sent_at > ?))").join(" OR ");
      const values = limits.flatMap(limit => [limit.key, now, limit.max, now - limit.cooldown]);
      const insert = db.prepare(`INSERT INTO email_challenges
        (id, email, purpose, code_hash, browser_hash, display_name, return_to, link_user_id, link_session_hash, created_at, expires_at)
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        WHERE NOT EXISTS (SELECT 1 FROM email_rate_limits WHERE ${guards})`)
        .bind(challenge.id, challenge.email, challenge.purpose, challenge.codeHash, challenge.browserHash, challenge.displayName,
          challenge.returnTo, challenge.linkUserId, challenge.linkSessionHash, now, challenge.expiresAt, ...values);
      await db.batch([
        db.prepare("DELETE FROM email_challenges WHERE expires_at <= ?").bind(now),
        db.prepare("DELETE FROM email_rate_limits WHERE reset_at <= ? AND last_sent_at <= ?").bind(now, now - 120000),
        insert,
        ...limits.map(limit => db.prepare(`INSERT INTO email_rate_limits (key, count, reset_at, last_sent_at)
          SELECT ?, 1, ?, ? WHERE EXISTS (SELECT 1 FROM email_challenges WHERE id = ?)
          ON CONFLICT(key) DO UPDATE SET count = CASE WHEN reset_at <= ? THEN 1 ELSE count + 1 END,
          reset_at = CASE WHEN reset_at <= ? THEN excluded.reset_at ELSE reset_at END, last_sent_at = excluded.last_sent_at`)
          .bind(limit.key, now + limit.window, now, challenge.id, now, now)),
      ]);
      return !!await first("SELECT id FROM email_challenges WHERE id = ?", challenge.id);
    },
    async attempt(id, browserHash, now) {
      return decode(await first(`UPDATE email_challenges SET attempts = attempts + 1
        WHERE id = ? AND browser_hash = ? AND expires_at > ? AND attempts < 5 RETURNING *`, id, browserHash, now));
    },
    async consume(id, codeHash, now) {
      return decode(await first("DELETE FROM email_challenges WHERE id = ? AND code_hash = ? AND expires_at > ? RETURNING *", id, codeHash, now));
    },
    async discard(id) { await db.prepare("DELETE FROM email_challenges WHERE id = ?").bind(id).run(); },
  };
}

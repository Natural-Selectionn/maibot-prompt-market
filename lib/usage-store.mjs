/** Durable unique acquisitions. All promotions and writes share one transaction. */
export function createUsageStore(db) {
  const promotion = (hash, userId) => [
    db.prepare("UPDATE usage_visitors SET user_id = ? WHERE token_hash = ? AND (user_id IS NULL OR user_id = ?)").bind(userId, hash, userId),
    db.prepare(`INSERT INTO prompt_usage (prompt_id, actor_id, action, created_at, updated_at)
      SELECT usage.prompt_id, ?, usage.action, usage.created_at, usage.updated_at
      FROM prompt_usage AS usage JOIN prompts ON prompts.id = usage.prompt_id
      WHERE usage.actor_id = ? AND prompts.owner_id <> ?
        AND EXISTS (SELECT 1 FROM usage_visitors WHERE token_hash = ? AND user_id = ?)
      ON CONFLICT(prompt_id, actor_id, action) DO UPDATE SET
        created_at = min(prompt_usage.created_at, excluded.created_at),
        updated_at = max(prompt_usage.updated_at, excluded.updated_at)`)
      .bind("user:" + userId, "visitor:" + hash, userId, hash, userId),
    db.prepare(`DELETE FROM prompt_usage WHERE actor_id = ?
      AND EXISTS (SELECT 1 FROM usage_visitors WHERE token_hash = ? AND user_id = ?)`)
      .bind("visitor:" + hash, hash, userId),
  ];
  return {
    browser: hash => db.prepare("SELECT user_id FROM usage_visitors WHERE token_hash = ?").bind(hash).first(),
    register: (hash, now) => db.prepare("INSERT INTO usage_visitors (token_hash, created_at) VALUES (?, ?) ON CONFLICT DO NOTHING").bind(hash, now).run(),
    claim: (hash, userId) => db.batch(promotion(hash, userId)),
    /** @param {{promptId: string, action: string, userId?: string | null, visitorHash?: string | null, now: string}} event */
    async record({ promptId, action, userId = null, visitorHash = null, now }) {
      const statements = [];
      if (userId && visitorHash) {
        statements.push(...promotion(visitorHash, userId));
      }
      // A browser already associated with an account keeps the same counting
      // identity after logout. It grants no permissions and reveals no identity.
      const browser = visitorHash ? await this.browser(visitorHash) : null;
      const account = userId ?? browser?.user_id ?? null;
      const actor = account ? "user:" + account : browser ? "visitor:" + visitorHash : null;
      if (!actor) return false;
      statements.push(db.prepare(`INSERT INTO prompt_usage (prompt_id, actor_id, action, created_at, updated_at)
        SELECT id, ?, ?, ?, ? FROM prompts
        WHERE id = ? AND (? IS NULL OR owner_id <> ?)
          AND (? = 'copy' OR (? = 'download' AND kind IN ('config', 'template')))
        ON CONFLICT(prompt_id, actor_id, action) DO UPDATE SET
          updated_at = max(prompt_usage.updated_at, excluded.updated_at)`)
        .bind(actor, action, now, now, promptId, account, account, action, action));
      const results = await db.batch(statements);
      return results.at(-1).meta.changes > 0;
    },
  };
}

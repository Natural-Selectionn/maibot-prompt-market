// SQLite and D1 share this transactional boundary. No notification stores body text.
/** @param {any} db @param {Record<string, string>} sampleTitles */
export function createNotificationStore(db, sampleTitles = {}) {
  const samples = Object.keys(sampleTitles);
  const sampleSql = samples.length ? `n.prompt_id IN (${samples.map(() => "?").join(",")})` : "0";
  const joins = `FROM notifications n LEFT JOIN prompts p ON p.id=n.prompt_id
    LEFT JOIN prompt_comments c ON c.id=n.comment_id AND c.prompt_id=n.prompt_id
    LEFT JOIN user_profiles a ON a.user_id=n.actor_user_id`;
  const valid = `n.recipient_user_id=? AND n.invalidated_at IS NULL
    AND (p.id IS NOT NULL OR ${sampleSql}) AND ((n.type='rating' AND EXISTS(SELECT 1 FROM prompt_ratings r WHERE r.prompt_id=n.prompt_id AND r.user_id=n.actor_user_id)) OR (n.type<>'rating' AND c.id IS NOT NULL AND c.deleted_at IS NULL))`;
  const bindings = actor => [actor, ...samples];
  const active = "EXISTS(SELECT 1 FROM user_profiles WHERE user_id=? AND disabled=0)";
  const notification = (commentId, reply) => db.prepare(`INSERT INTO notifications
    (recipient_user_id,source_key,type,actor_user_id,prompt_id,comment_id,created_at)
    SELECT ${reply ? "t.user_id" : "p.owner_id"}, 'comment:'||c.id, ${reply ? "'reply'" : "'comment'"}, c.user_id,c.prompt_id,c.id,c.created_at
    FROM prompt_comments c LEFT JOIN prompts p ON p.id=c.prompt_id
    LEFT JOIN prompt_comments t ON t.id=c.reply_to_id AND t.prompt_id=c.prompt_id
    JOIN user_profiles recipient ON recipient.user_id=${reply ? "t.user_id" : "p.owner_id"} AND recipient.disabled=0
    WHERE c.id=? AND c.deleted_at IS NULL AND recipient.user_id<>c.user_id
      ${reply ? "AND t.deleted_at IS NULL" : "AND (t.user_id IS NULL OR t.user_id<>p.owner_id)"}
    ON CONFLICT(recipient_user_id,source_key) DO NOTHING`).bind(commentId);

  return {
    /** @param {{promptId:string,actor:string,author:string,body:string,replyToId?:string|null,operationKey?:string|null,sample?:boolean}} input */
    async comment({ promptId, actor, author, body, replyToId = null, operationKey = null, sample = false }) {
      if (operationKey) {
        const previous = await db.prepare("SELECT id,prompt_id,body,reply_to_id,root_id,deleted_at FROM prompt_comments WHERE user_id=? AND operation_key=?").bind(actor, operationKey).first();
        if (previous) {
          if (previous.prompt_id !== promptId || previous.body !== body || previous.reply_to_id !== replyToId || previous.deleted_at) throw new Error("operation_conflict");
          return { id: previous.id, rootId: previous.root_id };
        }
      }
      const id = crypto.randomUUID(), now = new Date().toISOString();
      const result = await db.batch([
        db.prepare(`INSERT INTO prompt_comments(id,prompt_id,user_id,author,body,created_at,root_id,reply_to_id,operation_key)
          SELECT ?,?,?,?,?,?,CASE WHEN t.id IS NULL THEN NULL ELSE coalesce(t.root_id,t.id) END,?,?
          FROM (SELECT 1) seed LEFT JOIN prompt_comments t ON t.id=? AND t.prompt_id=? AND t.deleted_at IS NULL
          WHERE (?=1 OR EXISTS(SELECT 1 FROM prompts WHERE id=?)) AND ${active}
          AND (? IS NULL OR (t.id IS NOT NULL AND (t.root_id IS NULL OR EXISTS(SELECT 1 FROM prompt_comments root WHERE root.id=t.root_id AND root.prompt_id=? AND root.root_id IS NULL))))
          AND (SELECT count(*) FROM prompt_comments WHERE user_id=? AND created_at>?)<30
          ON CONFLICT(user_id,operation_key) DO NOTHING`)
          .bind(id,promptId,actor,author,body,now,replyToId,operationKey,replyToId,promptId,Number(sample),promptId,actor,replyToId,promptId,actor,new Date(Date.now()-60000).toISOString()),
        notification(id, true), notification(id, false),
      ]);
      const row = await db.prepare("SELECT id,root_id,prompt_id,body,reply_to_id,deleted_at FROM prompt_comments WHERE id=? OR (user_id=? AND operation_key=?)").bind(id,actor,operationKey).first();
      if (row) {
        if (row.prompt_id !== promptId || row.body !== body || row.reply_to_id !== replyToId || row.deleted_at) throw new Error("operation_conflict");
        return { id: row.id, rootId: row.root_id };
      }
      if (!result[0].meta.changes) {
        const recent = await db.prepare("SELECT count(*) AS count FROM prompt_comments WHERE user_id=? AND created_at>?").bind(actor,new Date(Date.now()-60000).toISOString()).first("count");
        if (Number(recent)>=30) throw new Error("rate_limited");
      }
      throw new Error("not_found");
    },
    async rate(promptId, actor, score, sample = false) {
      const now = new Date().toISOString();
      // Inspect the previous rating inside the same transaction, including legacy
      // votes that predate notifications. Only the first vote emits an event.
      const notify = db.prepare(`INSERT INTO notifications(recipient_user_id,source_key,type,actor_user_id,prompt_id,created_at)
        SELECT p.owner_id,'rating:'||p.id||':'||?,'rating',?,p.id,?
        FROM prompts p JOIN user_profiles u ON u.user_id=p.owner_id AND u.disabled=0
        WHERE p.id=? AND p.owner_id<>? AND ${active}
        AND NOT EXISTS(SELECT 1 FROM prompt_ratings r WHERE r.prompt_id=p.id AND r.user_id=?)
        ON CONFLICT(recipient_user_id,source_key) DO NOTHING`).bind(actor,actor,now,promptId,actor,actor,actor);
      const write = db.prepare(`INSERT INTO prompt_ratings(prompt_id,user_id,score,updated_at) SELECT ?,?,?,?
        WHERE (?=1 OR EXISTS(SELECT 1 FROM prompts WHERE id=?)) AND ${active}
        ON CONFLICT(prompt_id,user_id) DO UPDATE SET score=excluded.score,updated_at=excluded.updated_at`)
        .bind(promptId,actor,score,now,Number(sample),promptId,actor);
      const results = await db.batch([notify,write]);
      if (!results[1].meta.changes) throw new Error("not_found");
    },
    async withdrawRating(promptId, actor) {
      const now=new Date().toISOString();
      await db.batch([
        // Keep a silent tombstone even for legacy votes, so withdrawing and
        // re-rating cannot manufacture a new unread event after the migration.
        db.prepare(`INSERT INTO notifications(recipient_user_id,source_key,type,actor_user_id,prompt_id,created_at,invalidated_at)
          SELECT p.owner_id,'rating:'||p.id||':'||r.user_id,'rating',r.user_id,p.id,?,?
          FROM prompts p JOIN prompt_ratings r ON r.prompt_id=p.id WHERE p.id=? AND r.user_id=? AND p.owner_id<>r.user_id
          ON CONFLICT(recipient_user_id,source_key) DO UPDATE SET invalidated_at=excluded.invalidated_at`).bind(now,now,promptId,actor),
        db.prepare("DELETE FROM prompt_ratings WHERE prompt_id=? AND user_id=?").bind(promptId,actor),
      ]);
    },
    /** @param {string} actor @param {number|null} before */
    async list(actor, before = null) {
      const result = await db.batch([
        db.prepare(`SELECT coalesce(max(id),0) AS snapshot FROM notifications WHERE recipient_user_id=?`).bind(actor),
        db.prepare(`SELECT count(*) AS count ${joins} WHERE ${valid} AND n.read_at IS NULL`).bind(...bindings(actor)),
        db.prepare(`SELECT n.id,n.type,n.prompt_id,n.comment_id,n.created_at,n.read_at,p.title,c.body,
          a.display_name,a.id AS actor_tag,a.disambiguated,a.disabled ${joins} WHERE ${valid}
          ${before ? "AND n.id<?" : ""} ORDER BY n.id DESC LIMIT 21`).bind(...bindings(actor),...(before ? [before] : [])),
      ]);
      const rows = result[2].results;
      return { snapshot: Number(result[0].results[0].snapshot), unreadCount: Number(result[1].results[0].count),
        items: rows.slice(0,20).map(row => ({ id: Number(row.id), type: row.type, promptId: row.prompt_id,
          commentId: row.comment_id, title: row.title || sampleTitles[row.prompt_id] || "作品", createdAt: row.created_at, readAt: row.read_at,
          ...(row.type === "rating" ? {} : { body: row.body.slice(0,120), actor: row.disabled ? "麦麦用户" : row.display_name || "麦麦用户",
            actorTag: !row.disabled && row.actor_tag ? String(row.actor_tag).padStart(4,"0") : undefined }),
        })), hasMore: rows.length>20, next: rows.length>20 ? Number(rows[19].id) : null };
    },
    async count(actor) {
      return Number(await db.prepare(`SELECT count(*) AS count ${joins} WHERE ${valid} AND n.read_at IS NULL`).bind(...bindings(actor)).first("count"));
    },
    async read(actor, id) {
      const result = await db.prepare("UPDATE notifications SET read_at=coalesce(read_at,?) WHERE recipient_user_id=? AND id=?").bind(new Date().toISOString(),actor,id).run();
      return !!result.meta.changes;
    },
    async readAll(actor, snapshot) {
      await db.prepare("UPDATE notifications SET read_at=? WHERE recipient_user_id=? AND id<=? AND read_at IS NULL").bind(new Date().toISOString(),actor,snapshot).run();
    },
  };
}

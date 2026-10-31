import { createModerationQueue } from "./moderation-queue.mjs";

// Only active, owned submissions are discoverable here. Reuse the progress
// interface for deadline recovery; never expose the queued payload or rules.
export async function pendingSubmissions(db, actor, kind = "", { now = Date.now } = {}) {
  const rows = await db.prepare(`SELECT id, json_extract(payload,'$.title') AS title,
    json_extract(payload,'$.description') AS description, json_extract(payload,'$.kind') AS kind
    FROM moderation_jobs WHERE actor_id=? AND state IN ('queued','running')
    ${kind ? "AND json_extract(payload,'$.kind')=?" : ""} ORDER BY seq DESC LIMIT 10`)
    .bind(actor, ...(kind ? [kind] : [])).all();
  const queue = createModerationQueue(db, { now });
  const submissions = [];
  for (const row of rows.results) {
    const job = await queue.status(row.id, actor);
    if (job && ["queued", "running"].includes(job.state)) submissions.push({ ...job,
      title: row.title ?? "", description: row.description ?? "", kind: row.kind === "template" ? "template" : "config" });
  }
  return submissions;
}

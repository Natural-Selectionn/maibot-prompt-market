import { moderationMessages } from "./moderation-core.mjs";
import { versionRangeStorage } from "./version-range.mjs";

const active = "EXISTS (SELECT 1 FROM user_profiles WHERE user_id = ? AND disabled = 0)";
const ownsClaim = "EXISTS (SELECT 1 FROM moderation_jobs WHERE id = ? AND state = 'running' AND claim_token = ?)";
export const queueErrors = {
  account_changed: "账号状态已变化，无法发布。",
  work_changed: "作品已在其他页面更新或删除，请重新打开后修改。",
  queue_conflict: "提交编号对应的内容已变化，请重新提交。",
  queue_full: "待审核作品过多，请等待已有任务完成。",
};
const terminal = state => ["published", "rejected", "error"].includes(state);
const digest = async value => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))), byte => byte.toString(16).padStart(2, "0")).join("");

export function createModerationQueue(db, { now = Date.now, leaseMs = 30000 } = {}) {
  const find = id => db.prepare("SELECT * FROM moderation_jobs WHERE id = ?").bind(id).first();
  const event = (job, result, state = "running") => db.prepare(`INSERT OR IGNORE INTO moderation_events (id,work_id,operation,status,category,provider_id,attempts,cause,created_at)
    SELECT ?,?,?,?,?,?,?,?,? FROM moderation_jobs WHERE id=? AND state=? AND claim_token=?`)
    .bind("queue-" + job.id, job.work_id, job.operation, result.status, result.category, result.providerId ?? "", result.attempts ?? 0, result.cause,
      new Date(now()).toISOString(), job.id, state, job.claim_token);
  const mark = (job, state, code, status) => db.prepare(`UPDATE moderation_jobs SET state=?,error_code=?,http_status=?,finished_ms=?,payload='',config='',lease_ms=0
    WHERE id=? AND state='running' AND claim_token=?`).bind(state, code, status, now(), job.id, job.claim_token);

  const finish = async (job, result) => {
    if (result.status === "rejected") {
      await db.batch([event(job, result), mark(job, "rejected", result.category, 422)]);
      return;
    }
    const item = JSON.parse(job.payload), clock = new Date(now()).toISOString();
    const profile = await db.prepare("SELECT display_name,disabled FROM user_profiles WHERE user_id=?").bind(job.actor_id).first();
    if (!profile || profile.disabled) {
      await db.batch([event(job, result), mark(job, "error", "account_changed", 403)]);
      return;
    }
    const range = versionRangeStorage(item);
    const fields = { title: item.title ?? "", author: profile.display_name, description: item.description ?? "", category: item.category ?? "",
      kind: item.kind, scene: "", min_version: item.minVersion, max_version: item.maxVersion,
      min_version_key: range.minVersionKey, max_version_key: range.maxVersionKey, tags: JSON.stringify(item.tags ?? []), fields: JSON.stringify(item.fields ?? {}),
      template_name: item.templateName ?? "", template_locale: item.templateLocale ?? "", template_content: item.templateContent ?? "",
      template_files: JSON.stringify(item.templateFiles ?? []), template_basis: item.templateBasis ?? "unverified" };
    const columns = Object.keys(fields), values = Object.values(fields);
    const write = job.operation === "create" ? db.prepare(`INSERT INTO prompts (id,owner_id,created_at,${columns.join(",")})
      SELECT ?,?,?,${columns.map(() => "?").join(",")} WHERE ${active} AND ${ownsClaim}`)
      .bind(job.work_id, job.actor_id, clock, ...values, job.actor_id, job.id, job.claim_token) :
      db.prepare(`UPDATE prompts SET ${columns.map(column => column + "=?").join(",")},updated_at=? WHERE id=? AND owner_id=?
        AND coalesce(updated_at,created_at)=? AND ${active} AND ${ownsClaim}`)
        .bind(...values, clock, job.work_id, job.actor_id, job.revision, job.actor_id, job.id, job.claim_token);
    const results = await db.batch([write,
      db.prepare(`UPDATE moderation_jobs SET state='published',finished_ms=?,http_status=?,payload='',config='',lease_ms=0
        WHERE id=? AND state='running' AND claim_token=? AND changes()>0`).bind(now(), job.operation === "create" ? 201 : 200, job.id, job.claim_token),
      event(job, result, "published"),
    ]);
    if (!results[0].meta.changes) {
      const current = await db.prepare("SELECT disabled FROM user_profiles WHERE user_id=?").bind(job.actor_id).first();
      await db.batch([event(job, result), mark(job, "error", !current || current.disabled ? "account_changed" : "work_changed", !current || current.disabled ? 403 : 409)]);
    }
  };

  const expire = async (id, actor) => {
    const rows = id ? { results: await db.prepare("SELECT id FROM moderation_jobs WHERE id=? AND actor_id=? AND deadline_ms<=?").bind(id, actor, now()).all().then(value => value.results) } :
      await db.prepare("SELECT id FROM moderation_jobs WHERE deadline_ms<=? AND state IN ('queued','running') ORDER BY seq LIMIT 50").bind(now()).all();
    for (const row of rows.results) {
      const job = await db.prepare(`UPDATE moderation_jobs SET state='running',claim_token=?,lease_ms=? WHERE id=? AND deadline_ms<=?
        AND state IN ('queued','running') RETURNING *`)
        .bind(crypto.randomUUID(), now() + leaseMs, row.id, now()).first();
      if (job) await finish(job, { status: "skipped", category: "none", providerId: "", attempts: job.attempts, cause: "queue_timeout" });
    }
  };

  return {
    async enqueue({ id = crypto.randomUUID(), actor, workId, operation, item, revision = "", config }) {
      if (!/^[a-f0-9-]{36}$/i.test(id)) throw new Error("queue_conflict");
      const requestHash = await digest(JSON.stringify({ operation, workId: operation === "update" ? workId : "", item, revision }));
      const previous = await find(id);
      if (previous) {
        if (previous.actor_id !== actor || previous.request_hash !== requestHash) throw new Error("queue_conflict");
        return previous;
      }
      // The client keeps its submission ID across a lost HTTP response.
      let result;
      const submittedMs = now();
      try {
        result = await db.prepare(`INSERT INTO moderation_jobs (id,actor_id,work_id,operation,request_hash,revision,payload,config,created_ms,deadline_ms)
          SELECT ?,?,?,?,?,?,?,?,?,? WHERE ${active} AND (SELECT count(*) FROM moderation_jobs WHERE actor_id=? AND state IN ('queued','running'))<10`)
          .bind(id, actor, workId, operation, requestHash, revision, JSON.stringify(item), JSON.stringify(config), submittedMs, submittedMs + config.budgetMs, actor, actor).run();
      } catch (error) {
        const repeated = await db.prepare("SELECT * FROM moderation_jobs WHERE actor_id=? AND id=?").bind(actor, id).first();
        if (repeated?.request_hash === requestHash) return repeated;
        throw error;
      }
      if (!result.meta.changes) throw new Error("queue_full");
      return find(id);
    },
    async status(id, actor) {
      await expire(id, actor);
      const job = await db.prepare("SELECT id,work_id,operation,state,created_ms,deadline_ms,started_ms,finished_ms,http_status,error_code,seq FROM moderation_jobs WHERE id=? AND actor_id=?").bind(id, actor).first();
      if (!job) return null;
      const ahead = terminal(job.state) || job.state === "running" ? 0 : await db.prepare("SELECT count(*) AS n FROM moderation_jobs WHERE seq<? AND state IN ('queued','running')").bind(job.seq).first("n");
      return { id: job.id, workId: job.work_id, operation: job.operation, state: job.state, ahead, createdMs: job.created_ms,
        deadlineMs: job.deadline_ms, startedMs: job.started_ms, httpStatus: job.http_status,
        error: moderationMessages[job.error_code] ?? queueErrors[job.error_code] ?? "" };
    },
    async claim({ id, parallel = false } = {}) {
      await db.prepare("UPDATE moderation_jobs SET state='queued',claim_token='',lease_ms=0 WHERE state='running' AND lease_ms<? AND deadline_ms>?").bind(now(), now()).run();
      return db.prepare(`UPDATE moderation_jobs SET state='running',claim_token=?,started_ms=coalesce(started_ms,?),lease_ms=?
        WHERE id=(SELECT id FROM moderation_jobs WHERE state='queued' AND deadline_ms>? AND (? IS NULL OR id=?) ORDER BY seq LIMIT 1)
        AND (? OR NOT EXISTS (SELECT 1 FROM moderation_jobs WHERE state='running' AND lease_ms>=?)) RETURNING *`)
        .bind(crypto.randomUUID(), now(), now() + leaseMs, now(), id ?? null, id ?? null, parallel, now()).first();
    },
    async heartbeat(job) {
      return !!(await db.prepare("UPDATE moderation_jobs SET lease_ms=? WHERE id=? AND state='running' AND claim_token=?").bind(now() + leaseMs, job.id, job.claim_token).run()).meta.changes;
    },
    async progress(job, progress) {
      await db.prepare("UPDATE moderation_jobs SET provider_id=?,attempts=? WHERE id=? AND state='running' AND claim_token=?").bind(progress.providerId, progress.attempts, job.id, job.claim_token).run();
    },
    async release(job) {
      await db.prepare("UPDATE moderation_jobs SET state='queued',claim_token='',lease_ms=0 WHERE id=? AND state='running' AND claim_token=?").bind(job.id, job.claim_token).run();
    },
    async stats() {
      const rows = await db.prepare("SELECT state,count(*) AS n FROM moderation_jobs WHERE state IN ('queued','running') GROUP BY state").all();
      return Object.fromEntries([ ["queued", 0], ["running", 0], ...rows.results.map(row => [row.state, row.n]) ]);
    },
    async cleanup() {
      await db.prepare("DELETE FROM moderation_jobs WHERE finished_ms<? AND state IN ('published','rejected','error')").bind(now() - 7 * 86400000).run();
    },
    expire, finish,
  };
}

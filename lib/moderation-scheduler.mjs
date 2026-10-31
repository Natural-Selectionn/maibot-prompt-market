import { createHash } from "node:crypto";
import { createModerationQueue } from "./moderation-queue.mjs";

// Aliases of one endpoint share capacity, even when model names or keys differ.
export const providerResource = provider => createHash("sha256").update(provider.endpoint.replace(/\/+$/, "").replace(/\/(chat\/completions|responses)$/, "")).digest("hex");
const limits = provider => ({ concurrency: provider.concurrency ?? 1, rateLimit: provider.rateLimit ?? 0 });
const minimumRate = values => Math.min(...values.filter(value => value > 0), Infinity);

export function createModerationScheduler(db, { now = Date.now, leaseMs = 30000 } = {}) {
  const queue = createModerationQueue(db, { now, leaseMs });
  const recover = async () => {
    await db.prepare(`UPDATE moderation_provider_calls SET outcome='abandoned',finished_ms=?,duration_ms=min(allowance_ms,max(0,?-started_ms)),lease_ms=0
      WHERE outcome='running' AND (lease_ms<? OR NOT EXISTS (SELECT 1 FROM moderation_jobs j WHERE j.id=job_id AND j.state='running' AND j.claim_token=moderation_provider_calls.id))`)
      .bind(now(), now(), now()).run();
    await db.prepare("UPDATE moderation_jobs SET state='queued',claim_token='',lease_ms=0 WHERE state='running' AND lease_ms<? AND deadline_ms>?").bind(now(), now()).run();
  };
  return {
    recover,
    async dispatch(liveProviders = []) {
      await recover();
      const live = new Map();
      for (const provider of liveProviders) {
        const key = providerResource(provider), group = live.get(key) ?? [];
        group.push(provider); live.set(key, group);
      }
      for (let offset = 0; ; offset += 100) {
        const rows = (await db.prepare("SELECT id,config,deadline_ms FROM moderation_jobs WHERE state='queued' AND deadline_ms>? ORDER BY seq LIMIT 100 OFFSET ?").bind(now(), offset).all()).results;
        for (const row of rows) {
          const config = JSON.parse(row.config), history = (await db.prepare("SELECT provider_id,sum(CASE WHEN outcome NOT IN ('cancelled','abandoned') THEN 1 ELSE 0 END) AS n,sum(duration_ms) AS used,sum(CASE WHEN outcome='invalid_request' THEN 1 ELSE 0 END) AS permanent FROM moderation_provider_calls WHERE job_id=? GROUP BY provider_id").bind(row.id).all()).results;
          const candidates = config.providers.filter(provider => provider.enabled && (provider.encryptedKey || provider.apiKey)).map((provider, index) => {
            const previous = history.find(value => value.provider_id === provider.id), key = providerResource(provider), group = live.get(key) ?? [provider];
            const current = group.find(value => value.id === provider.id) ?? provider;
            return { provider, key, priority: current.priority ?? index + 1, count: previous?.n ?? 0,
              concurrency: Math.min(...group.map(value => limits(value).concurrency)), rateLimit: minimumRate(group.map(value => limits(value).rateLimit)),
              remaining: previous?.permanent ? 0 : Math.min(row.deadline_ms - now(), config.timeoutMs - (previous?.used ?? 0)) };
          }).filter(value => value.count < config.maxAttempts && value.remaining > 0).sort((a, b) => a.count - b.count || a.priority - b.priority);
          if (!candidates.length) {
            const job = await queue.claim({ id: row.id, parallel: true });
            if (job) return { job, provider: null };
            continue;
          }
          for (const candidate of candidates) {
            const { provider, key, concurrency, remaining } = candidate;
            const id = crypto.randomUUID(), clock = now(), rate = Number.isFinite(candidate.rateLimit) ? candidate.rateLimit : 0;
            // Reservation and job claim form one SQLite transaction. Multiple worker
            // processes cannot exceed slots, the rolling rate, or claim one job twice.
            const reserved = await db.batch([
              db.prepare(`INSERT INTO moderation_provider_calls (id,job_id,provider_id,resource_key,started_ms,allowance_ms,lease_ms)
                SELECT ?,?,?,?,?,?,? FROM moderation_jobs j WHERE j.id=? AND j.state='queued' AND j.deadline_ms>?
                AND coalesce((SELECT cooldown_ms FROM moderation_provider_health WHERE resource_key=?),0)<=?
                AND (SELECT count(*) FROM moderation_provider_calls WHERE resource_key=? AND outcome='running' AND lease_ms>=?)<?
                AND (?=0 OR (SELECT count(*) FROM moderation_provider_calls WHERE resource_key=? AND started_ms>?)<?)`)
                .bind(id, row.id, provider.id, key, clock, remaining, clock + leaseMs, row.id, clock, key, clock, key, clock, concurrency, rate, key, clock - 60000, rate),
              db.prepare(`UPDATE moderation_jobs SET state='running',claim_token=?,provider_id=?,attempts=attempts+1,started_ms=coalesce(started_ms,?),lease_ms=?
                WHERE id=? AND state='queued' AND changes()>0 RETURNING *`).bind(id, provider.id, clock, clock + leaseMs, row.id),
            ]);
            const job = reserved[1].results[0];
            if (job) return { job, provider, timeoutMs: remaining };
          }
        }
        if (rows.length < 100) return null;
      }
    },
    async heartbeat(job) {
      const results = await db.batch([
        db.prepare("UPDATE moderation_jobs SET lease_ms=? WHERE id=? AND state='running' AND claim_token=?").bind(now() + leaseMs, job.id, job.claim_token),
        db.prepare("UPDATE moderation_provider_calls SET lease_ms=? WHERE id=? AND outcome='running' AND changes()>0").bind(now() + leaseMs, job.claim_token),
      ]);
      return results[0].meta.changes > 0 && results[1].meta.changes > 0;
    },
    async complete(job, result, { cancelled = false } = {}) {
      const clock = now(), failed = result.status === "skipped";
      const contextExceeded = failed && result.failureCode === "context_length_exceeded";
      const permanent = contextExceeded || (failed && result.httpStatus >= 400 && result.httpStatus < 500 && result.httpStatus !== 429 && result.httpStatus !== 408);
      const outcome = cancelled ? "cancelled" : permanent ? "invalid_request" : failed ? "failed" : result.status;
      const call = await db.prepare(`UPDATE moderation_provider_calls SET outcome=?,finished_ms=?,duration_ms=min(allowance_ms,max(0,?-started_ms)),lease_ms=0
        WHERE id=? AND outcome='running' RETURNING *`).bind(outcome, clock, clock, job.claim_token).first();
      if (!call) return;
      // This work does not fit; the endpoint can still serve other, shorter work.
      // Preserve any unrelated existing health/cooldown rather than resetting it.
      if (!cancelled && !contextExceeded) {
        const retryAfter = Math.max(0, Math.min(result.retryAfterMs ?? 0, 600000));
        await db.prepare(`INSERT INTO moderation_provider_health (resource_key,failures,cooldown_ms) VALUES (?,?,?)
          ON CONFLICT(resource_key) DO UPDATE SET failures=CASE WHEN ? THEN failures+1 ELSE 0 END,
          cooldown_ms=CASE WHEN ? THEN max(cooldown_ms,? + CASE WHEN failures+1>=3 THEN max(60000,?) ELSE ? END) ELSE 0 END`)
          .bind(call.resource_key, failed ? 1 : 0, failed && retryAfter ? clock + retryAfter : 0, failed, failed, clock, retryAfter, retryAfter).run();
      }
      if (cancelled || failed) await queue.release(job);
      else await queue.finish(job, { ...result, providerId: job.provider_id, attempts: job.attempts });
    },
    async metrics(providers) {
      const clock = now(), result = {};
      for (const provider of providers) {
        const key = providerResource(provider);
        const counts = await db.prepare(`SELECT
          sum(CASE WHEN c.outcome='running' AND c.lease_ms>=? AND EXISTS(SELECT 1 FROM moderation_jobs j WHERE j.id=c.job_id AND j.state='running' AND j.claim_token=c.id) THEN 1 ELSE 0 END) AS running,
          sum(CASE WHEN started_ms>? THEN 1 ELSE 0 END) AS lastMinute,
          sum(CASE WHEN finished_ms>? AND outcome NOT IN ('running','cancelled') THEN 1 ELSE 0 END) AS samples,
          sum(CASE WHEN finished_ms>? AND outcome IN ('failed','abandoned','invalid_request') THEN 1 ELSE 0 END) AS failures,
          avg(CASE WHEN finished_ms>? AND outcome NOT IN ('running','cancelled') THEN duration_ms END) AS averageMs
          FROM moderation_provider_calls c WHERE resource_key=? AND started_ms>?`)
          .bind(clock, clock - 60000, clock - 3600000, clock - 3600000, clock - 3600000, key, clock - 7200000).first();
        const health = await db.prepare("SELECT cooldown_ms FROM moderation_provider_health WHERE resource_key=?").bind(key).first();
        result[provider.id] = { running: counts.running ?? 0, lastMinute: counts.lastMinute ?? 0, samples: counts.samples ?? 0,
          averageMs: counts.averageMs === null ? null : Math.round(counts.averageMs), failureRate: counts.samples ? counts.failures / counts.samples : null,
          cooldownUntilMs: health?.cooldown_ms ?? 0 };
      }
      return result;
    },
    async cleanup() {
      await db.prepare("DELETE FROM moderation_provider_calls WHERE outcome!='running' AND finished_ms<?").bind(now() - 7 * 86400000).run();
    },
  };
}

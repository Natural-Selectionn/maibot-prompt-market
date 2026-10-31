import { openSqliteD1 } from "../db/sqlite-d1.mjs";
import { createModerationQueue } from "../lib/moderation-queue.mjs";
import { createModerationStore } from "../lib/moderation-store.mjs";
import { createModerationScheduler } from "../lib/moderation-scheduler.mjs";
import { reviewPrompt } from "../lib/moderation-core.mjs";

const db = openSqliteD1(process.env.MAIBOT_DATABASE_PATH ?? "./data/maibot.sqlite");
const queue = createModerationQueue(db), scheduler = createModerationScheduler(db);
const store = createModerationStore(db, process.env.MODERATION_ENCRYPTION_KEY, { localEndpoint: process.env.MODERATION_LOCAL_ENDPOINT });
const running = new Map();
let stopping = false, sweepBusy = false;
const stop = () => { stopping = true; for (const task of running.values()) task.controller.abort(); };
process.once("SIGINT", stop); process.once("SIGTERM", stop);
const sweep = async () => {
  if (sweepBusy || stopping) return;
  sweepBusy = true;
  try { await queue.expire(); await scheduler.recover(); } catch { console.error("Moderation queue expiration unavailable"); }
  finally { sweepBusy = false; }
};
const cleanup = async () => { await queue.cleanup(); await scheduler.cleanup(); };
async function processJob({ job, provider, timeoutMs }, controller) {
  if (!provider) {
    await queue.finish(job, { status: "skipped", category: "none", providerId: job.provider_id, attempts: job.attempts, cause: "unavailable" });
    return;
  }
  const heartbeat = setInterval(async () => {
    try { if (!await scheduler.heartbeat(job)) controller.abort(); }
    catch { controller.abort(); }
  }, 5000);
  try {
    let result;
    try {
      const snapshot = JSON.parse(job.config), config = await store.runtime({ ...snapshot, providers: [provider] });
      result = await reviewPrompt(JSON.parse(job.payload), { ...config, timeoutMs, maxAttempts: 1 }, {
        budgetMs: Math.max(1, job.deadline_ms - Date.now()), signal: controller.signal,
      });
    } catch { result = { status: "skipped", category: "none", cause: "unavailable" }; }
    if (result.status === "skipped" && result.failureCode !== "context_length_exceeded") result.retryAfterMs = Math.max(result.retryAfterMs ?? 0, 1000 + Math.floor(Math.random() * 1000));
    await scheduler.complete(job, result, { cancelled: controller.signal.aborted || stopping });
  } finally { clearInterval(heartbeat); }
}
const sweepTimer = setInterval(sweep, 1000);
const cleanupTimer = setInterval(() => cleanup().catch(() => {}), 3600000);
try {
  await cleanup();
  while (!stopping) {
    try {
      await sweep();
      const live = await store.snapshot();
      // Five providers, at most ten slots each; no unbounded promise fan-out.
      while (!stopping && running.size < 50) {
        const dispatch = await scheduler.dispatch(live.providers);
        if (!dispatch) break;
        const controller = new AbortController(), task = { controller, promise: null };
        running.set(dispatch.job.claim_token, task);
        task.promise = processJob(dispatch, controller).catch(async () => {
          console.error("Moderation queue processing unavailable");
          try { await scheduler.complete(dispatch.job, { status: "skipped" }, { cancelled: true }); } catch {}
        }).finally(() => running.delete(dispatch.job.claim_token));
      }
    } catch { console.error("Moderation queue dispatch unavailable"); }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
} finally {
  clearInterval(sweepTimer); clearInterval(cleanupTimer);
  await Promise.allSettled([...running.values()].map(task => task.promise));
  db.close();
}

import { env } from "@/db/binding";
import { createModerationStore } from "./moderation-store.mjs";
import { reviewPrompt, moderationMessages } from "./moderation-core.mjs";
import type { PromptItem } from "./prompts";
import { createModerationQueue, queueErrors } from "./moderation-queue.mjs";
import { createModerationScheduler } from "./moderation-scheduler.mjs";

export const moderationStore = () => createModerationStore(env.DB!, process.env.MODERATION_ENCRYPTION_KEY, { localEndpoint: process.env.MODERATION_LOCAL_ENDPOINT });
export const moderationQueue = () => createModerationQueue(env.DB!);
export const moderationScheduler = () => createModerationScheduler(env.DB!);

export async function enqueuePublication(request: Request, item: Omit<PromptItem, "id" | "createdAt">, workId: string, operation: "create" | "update", actor: string, revision = "") {
  if (process.env.MAIBOT_RUNTIME !== "vps") return null;
  const skip = async (cause: string) => {
    try { await moderationStore().record({ status: "skipped", category: "none", providerId: "", attempts: 0, cause, workId, operation }); }
    catch { console.error("Moderation audit write unavailable"); }
    return null;
  };
  let config;
  try { config = await moderationStore().snapshot(); } catch { return skip("unavailable"); }
  if (!config.enabled) return skip("disabled");
  if (!config.providers.some((provider: { enabled: boolean; encryptedKey?: string }) => provider.enabled && provider.encryptedKey)) return skip("unconfigured");
  try {
    const queue = moderationQueue(), accepted = await queue.enqueue({ id: request.headers.get("Idempotency-Key") ?? crypto.randomUUID(), actor, workId, operation, item, revision, config });
    const job = await queue.status(accepted.id, actor);
    return Response.json({ job }, { status: 202, headers: { "Cache-Control": "no-store", "Retry-After": "2", Location: `/api/moderation/jobs/${accepted.id}` } });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "queue_full" || code === "queue_conflict") return Response.json({ error: queueErrors[code] }, { status: code === "queue_full" ? 429 : 409 });
    throw error;
  }
}

export async function moderatePublication(item: Omit<PromptItem, "id" | "createdAt">, workId: string, operation: "create" | "update") {
  // The VPS request already captured its settings in enqueuePublication. Never
  // reread newly-enabled settings and start a long model call on this HTTP path.
  if (process.env.MAIBOT_RUNTIME === "vps") return null;
  let result;
  try { result = await reviewPrompt(item, await moderationStore().runtime()); }
  catch { result = { status: "skipped", category: "none", providerId: "", attempts: 0, cause: "unavailable" }; }
  try { await moderationStore().record({ ...result, workId, operation }); }
  catch { console.error("Moderation audit write unavailable"); }
  return result.status === "rejected" ? Response.json({ error: moderationMessages[result.category as keyof typeof moderationMessages], code: "moderation_rejected" }, { status: 422, headers: { "Cache-Control": "no-store" } }) : null;
}

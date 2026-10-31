import { PRIMARY_ADMIN_ACCOUNT_ID } from "./admin-policy.mjs";
import { MAX_MODERATION_PROVIDERS, MODERATION_INSTRUCTIONS, validateModerationEndpoint } from "./moderation-core.mjs";

const primaryAdmin = `EXISTS (SELECT 1 FROM user_profiles WHERE user_id = ? AND id = ${PRIMARY_ADMIN_ACCOUNT_ID} AND role = 'admin' AND disabled = 0)`;
const projection = provider => { const { encryptedKey, ...publicFields } = provider; return { ...publicFields, hasApiKey: !!encryptedKey }; };
export const encryptionReady = secret => typeof secret === "string" && /^[a-f0-9]{64}$/i.test(secret);
async function encryptionKey(secret) {
  if (!encryptionReady(secret)) throw new Error("moderation_encryption_unavailable");
  return crypto.subtle.importKey("raw", Uint8Array.from(secret.match(/../g), byte => parseInt(byte, 16)), "AES-GCM", false, ["encrypt", "decrypt"]);
}
async function encrypt(value, secret, id) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode(id) }, await encryptionKey(secret), new TextEncoder().encode(value));
  return btoa(String.fromCharCode(...iv, ...new Uint8Array(cipher)));
}
async function decrypt(value, secret, id) {
  const bytes = Uint8Array.from(atob(value), char => char.charCodeAt(0));
  const text = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.slice(0, 12), additionalData: new TextEncoder().encode(id) }, await encryptionKey(secret), bytes.slice(12));
  return new TextDecoder().decode(text);
}

export function createModerationStore(db, secret, { localEndpoint = "" } = {}) {
  const requirePrimary = async actor => {
    if (!await db.prepare(`SELECT 1 AS allowed WHERE ${primaryAdmin}`).bind(actor).first()) throw new Error("moderation_forbidden");
  };
  const read = async () => {
    const row = await db.prepare("SELECT * FROM moderation_settings WHERE id = 1").first();
    if (!row) throw new Error("moderation_settings_unavailable");
    return { enabled: !!row.enabled, timeoutMs: row.timeout_ms, budgetMs: row.budget_ms ?? 600000, instructions: row.instructions || MODERATION_INSTRUCTIONS, maxAttempts: row.max_attempts, providers: JSON.parse(row.providers).map((provider, index) => ({ concurrency: 1, rateLimit: 0, priority: index + 1, ...provider })), revision: row.revision };
  };
  const eventPage = async (actor, offset = 0) => {
    await requirePrimary(actor);
    const start = Number.isSafeInteger(offset) && offset >= 0 ? offset : 0;
    const { results } = await db.prepare("SELECT work_id AS workId,operation,status,category,provider_id AS providerId,attempts,cause,created_at AS createdAt FROM moderation_events ORDER BY created_at DESC, id DESC LIMIT 21 OFFSET ?").bind(start).all();
    return { items: results.slice(0, 20), hasMore: results.length > 20, offset: start };
  };
  return {
    async settings(actor) {
      await requirePrimary(actor);
      const config = await read();
      return { ...config, providers: config.providers.map(projection), encryptionReady: encryptionReady(secret) };
    },
    snapshot: read,
    async runtime(snapshot) {
      const config = snapshot ?? await read();
      return { ...config, providers: await Promise.all(config.providers.map(async provider => {
        let apiKey = "";
        if (config.enabled && provider.enabled && provider.encryptedKey) {
          try { apiKey = await decrypt(provider.encryptedKey, secret, provider.id); } catch { /* other providers still run */ }
        }
        return { ...provider, apiKey };
      })) };
    },
    async save(actor, payload) {
      await requirePrimary(actor);
      if (!payload || typeof payload !== "object" || Array.isArray(payload) ||
        Object.keys(payload).some(key => !["enabled", "timeoutMs", "budgetMs", "instructions", "maxAttempts", "providers", "revision"].includes(key)) ||
        typeof payload.enabled !== "boolean" || typeof payload.revision !== "string" ||
        !Number.isInteger(payload.timeoutMs) || payload.timeoutMs < 1000 || payload.timeoutMs > 600000 ||
        (payload.budgetMs !== undefined && (!Number.isInteger(payload.budgetMs) || payload.budgetMs < 1000 || payload.budgetMs > 3600000)) ||
        (payload.instructions !== undefined && (typeof payload.instructions !== "string" || !payload.instructions.trim() || payload.instructions.length > 20000)) ||
        !Number.isInteger(payload.maxAttempts) || payload.maxAttempts < 1 || payload.maxAttempts > 3 ||
        !Array.isArray(payload.providers) || payload.providers.length > MAX_MODERATION_PROVIDERS) throw new Error("invalid_moderation_settings");
      const existing = await read();
      const budgetMs = payload.budgetMs ?? existing.budgetMs, instructions = payload.instructions ?? existing.instructions;
      if (payload.timeoutMs > budgetMs) throw new Error("invalid_moderation_settings");
      if (payload.revision !== existing.revision) throw new Error("moderation_conflict");
      const ids = new Set(), providers = [];
      for (const raw of payload.providers) {
        if (!raw || typeof raw !== "object" || Array.isArray(raw) ||
          Object.keys(raw).some(key => !["id", "name", "format", "endpoint", "model", "enabled", "apiKey", "disableThinking", "reasoningEffort", "concurrency", "rateLimit", "priority"].includes(key)) ||
          typeof raw.id !== "string" || !/^[a-zA-Z0-9-]{1,64}$/.test(raw.id) || ids.has(raw.id) ||
          typeof raw.name !== "string" || !raw.name.trim() || raw.name.length > 60 ||
          !["chat_completions", "responses"].includes(raw.format) || typeof raw.enabled !== "boolean" ||
          typeof raw.model !== "string" || !raw.model.trim() || raw.model.length > 120 ||
          (raw.disableThinking !== undefined && typeof raw.disableThinking !== "boolean") ||
          (raw.reasoningEffort !== undefined && !["default", "low", "medium", "high"].includes(raw.reasoningEffort)) ||
          (raw.concurrency !== undefined && (!Number.isInteger(raw.concurrency) || raw.concurrency < 1 || raw.concurrency > 10)) ||
          (raw.rateLimit !== undefined && (!Number.isInteger(raw.rateLimit) || raw.rateLimit < 0 || raw.rateLimit > 6000)) ||
          (raw.priority !== undefined && (!Number.isInteger(raw.priority) || raw.priority < 1 || raw.priority > 100)) ||
          (raw.apiKey !== undefined && (typeof raw.apiKey !== "string" || raw.apiKey.length > 4096 || /[\r\n]/.test(raw.apiKey)))) throw new Error("invalid_moderation_settings");
        ids.add(raw.id);
        const endpoint = validateModerationEndpoint(raw.endpoint, { localEndpoint }), previous = existing.providers.find(provider => provider.id === raw.id);
        // Never redirect a stored credential to a newly entered destination.
        if (previous && previous.endpoint !== endpoint && !raw.apiKey?.trim()) throw new Error("moderation_endpoint_key_required");
        const encryptedKey = raw.apiKey?.trim() ? await encrypt(raw.apiKey.trim(), secret, raw.id) : previous?.encryptedKey ?? "";
        if (raw.enabled && !encryptedKey) throw new Error("moderation_key_required");
        providers.push({ id: raw.id, name: raw.name.trim(), format: raw.format, endpoint, model: raw.model.trim(), enabled: raw.enabled, disableThinking: raw.disableThinking ?? false, reasoningEffort: raw.reasoningEffort ?? "default", concurrency: raw.concurrency ?? 1, rateLimit: raw.rateLimit ?? 0, priority: raw.priority ?? providers.length + 1, encryptedKey });
      }
      if (payload.enabled && !providers.some(provider => provider.enabled && provider.encryptedKey)) throw new Error("moderation_key_required");
      const revision = crypto.randomUUID();
      const result = await db.batch([
        db.prepare(`UPDATE moderation_settings SET enabled = ?, timeout_ms = ?, budget_ms = ?, instructions = ?, max_attempts = ?, providers = ?, revision = ?, updated_at = ? WHERE id = 1 AND revision = ? AND ${primaryAdmin}`)
          .bind(Number(payload.enabled), payload.timeoutMs, budgetMs, instructions, payload.maxAttempts, JSON.stringify(providers), revision, new Date().toISOString(), payload.revision, actor),
        db.prepare("INSERT INTO admin_audit (id,actor_id,action,target_id,created_at) SELECT ?,?,'moderation:settings','1',? WHERE changes() > 0")
          .bind(crypto.randomUUID(), actor, new Date().toISOString()),
      ]);
      if (!result[0].meta.changes) throw new Error("moderation_conflict");
      return { enabled: payload.enabled, timeoutMs: payload.timeoutMs, budgetMs, instructions, maxAttempts: payload.maxAttempts, providers: providers.map(projection), revision, encryptionReady: encryptionReady(secret) };
    },
    async record(event) {
      await db.prepare("INSERT INTO moderation_events (id,work_id,operation,status,category,provider_id,attempts,cause,created_at) VALUES (?,?,?,?,?,?,?,?,?)")
        .bind(crypto.randomUUID(), event.workId, event.operation, event.status, event.category, event.providerId, event.attempts, event.cause, new Date().toISOString()).run();
    },
    async events(actor) {
      return (await eventPage(actor)).items;
    },
    eventPage,
  };
}

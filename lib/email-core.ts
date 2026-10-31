import { opaqueToken, safeReturnTo, SESSION_AGE, tokenHash, type AuthStore } from "./auth-contract.ts";
import type { BrowserBinding } from "./oauth-core.ts";
import { hashPassword } from "./password-core.mjs";
import type { createPasswordStore } from "./password-store.mjs";

export const EMAIL_FLOW_COOKIE = "mai_email_flow";
export const EMAIL_FLOW_PATH = "/api/auth/email";
export const EMAIL_AGE = 900;
export const EMAIL_RETRY_AFTER = 120;
export type EmailChallenge = {
  id: string; email: string; purpose: "register" | "reset" | "link" | "set-password"; codeHash: string; browserHash: string; displayName: string;
  returnTo: string; linkUserId: string | null; linkSessionHash: string | null;
  createdAt: number; expiresAt: number; attempts?: number;
};
type Limit = { key: string; max: number; window: number; cooldown: number };
export interface EmailStore {
  reserve(challenge: EmailChallenge, limits: Limit[]): Promise<boolean>;
  attempt(id: string, browserHash: string, now: number): Promise<EmailChallenge | null>;
  consume(id: string, codeHash: string, now: number): Promise<EmailChallenge | null>;
  discard(id: string): Promise<void>;
}
export class EmailAuthError extends Error {
  reason: string;
  status: number;
  constructor(reason: string, status = 400) { super(reason); this.reason = reason; this.status = status; }
}
export function normalizeEmail(value: unknown): string {
  if (typeof value !== "string") throw new EmailAuthError("invalid_email");
  const email = value.trim().toLowerCase();
  const [local, domain, extra] = email.split("@");
  if (extra !== undefined || email.length > 254 || !local || local.length > 64 || !domain ||
    !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local) || local.startsWith(".") || local.endsWith(".") || local.includes("..") ||
    !domain.includes(".") || domain.split(".").some(label => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) {
    throw new EmailAuthError("invalid_email");
  }
  return email;
}
export async function emailMac(secret: string, message: string) {
  if (secret.length < 32) throw new EmailAuthError("not_ready", 503);
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(message))), byte => byte.toString(16).padStart(2, "0")).join("");
}
function randomCode() {
  const random = new Uint32Array(1);
  do { crypto.getRandomValues(random); } while (random[0] >= 4294000000);
  return String(random[0] % 1000000).padStart(6, "0");
}
function equalHash(a: string, b: string) {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index++) difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return difference === 0;
}
export async function startEmail(options: {
  store: EmailStore; secret: string; email: unknown; displayName?: unknown; returnTo?: string | null;
  purpose?: EmailChallenge["purpose"];
  link: boolean; browser: BrowserBinding; ip: string; now?: number;
  send: (email: string, code: string, id: string) => Promise<void>;
}) {
  const email = normalizeEmail(options.email);
  const purpose = options.link ? "link" : options.purpose ?? "register";
  if (!["register", "reset", "link", "set-password"].includes(purpose)) throw new EmailAuthError("invalid_request");
  const bound = purpose === "link" || purpose === "set-password";
  if (bound && !options.browser) throw new EmailAuthError("link_expired", 401);
  const now = options.now ?? Date.now();
  const id = opaqueToken();
  const cookie = opaqueToken();
  const code = randomCode();
  const challenge: EmailChallenge = {
    id, email, purpose, codeHash: await emailMac(options.secret, `code:${id}:${code}`), browserHash: await tokenHash(cookie),
    displayName: typeof options.displayName === "string" ? options.displayName.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 24) || "麦麦用户" : "麦麦用户",
    returnTo: purpose === "link" ? "/account?auth_linked=1" : purpose === "set-password" ? "/account" : safeReturnTo(options.returnTo ?? null),
    linkUserId: bound ? options.browser!.userId : null,
    linkSessionHash: bound ? options.browser!.sessionHash : null,
    createdAt: now, expiresAt: now + EMAIL_AGE * 1000,
  };
  const reserved = await options.store.reserve(challenge, [
    { key: "global:day", max: 90, window: 86400000, cooldown: 0 },
    { key: "global:hour", max: 30, window: 3600000, cooldown: 0 },
    { key: "email:" + await emailMac(options.secret, email), max: 5, window: 3600000, cooldown: EMAIL_RETRY_AFTER * 1000 },
    { key: "ip:" + await emailMac(options.secret, options.ip), max: 30, window: 3600000, cooldown: 0 },
  ]);
  if (!reserved) throw new EmailAuthError("rate_limited", 429);
  try { await options.send(email, code, id); }
  catch { await options.store.discard(id); throw new EmailAuthError("send_failed", 503); }
  return { id, cookie };
}
export async function completeEmail(options: {
  store: EmailStore; accounts: AuthStore; secret: string; id: unknown; code: unknown;
  password?: unknown; passwords?: ReturnType<typeof createPasswordStore>;
  cookie: string | undefined; browser: BrowserBinding; now?: number;
}) {
  const { id, code, cookie, store, accounts } = options;
  if (typeof id !== "string" || !/^[a-f0-9]{64}$/.test(id) || typeof code !== "string" || !/^\d{6}$/.test(code) || !cookie || !/^[a-f0-9]{64}$/.test(cookie)) throw new EmailAuthError("invalid_code");
  const now = options.now ?? Date.now();
  const challenge = await store.attempt(id, await tokenHash(cookie), now);
  if (!challenge) throw new EmailAuthError("invalid_code");
  if (challenge.linkUserId && (!options.browser || options.browser.userId !== challenge.linkUserId || options.browser.sessionHash !== challenge.linkSessionHash)) throw new EmailAuthError("link_expired", 401);
  const hash = await emailMac(options.secret, `code:${id}:${code}`);
  if (!equalHash(hash, challenge.codeHash)) throw new EmailAuthError("invalid_code");
  if (!["register", "reset", "link", "set-password"].includes(challenge.purpose)) throw new EmailAuthError("invalid_code");
  let passwordHash = "";
  if (challenge.purpose !== "link") {
    if (!options.passwords) throw new EmailAuthError("not_ready", 503);
    try { passwordHash = await hashPassword(options.password); }
    catch { throw new EmailAuthError("invalid_password"); }
  }
  if (!await store.consume(id, hash, now)) throw new EmailAuthError("invalid_code");
  const token = opaqueToken();
  const sessionHash = await tokenHash(token);
  const expiresAt = now + SESSION_AGE * 1000;
  let userId: string;
  try {
    if (challenge.purpose === "link") {
      userId = await accounts.resolveIdentity({ provider: "email", subject: challenge.email, displayName: challenge.displayName }, challenge.linkUserId);
      await accounts.createSession(sessionHash, userId, expiresAt);
    } else if (challenge.purpose === "register") {
      userId = await options.passwords!.register(challenge.email, challenge.displayName, passwordHash, sessionHash, expiresAt);
    } else {
      const account = await options.passwords!.account(challenge.email);
      if (!account || account.disabled || (challenge.linkUserId && account.user_id !== challenge.linkUserId)) throw new Error("identity_conflict");
      userId = account.user_id;
      if (!await options.passwords!.replace(userId, account.password_hash, passwordHash, sessionHash, expiresAt, challenge.linkSessionHash, now)) throw new Error("identity_conflict");
    }
  }
  catch { throw new EmailAuthError("identity_conflict", 409); }
  return { token, returnTo: safeReturnTo(challenge.returnTo), userId };
}

import { env } from "@/db/binding";
import { cookies } from "next/headers";
import { authCookie, authStore } from "./auth-server";
import { opaqueToken, safeReturnTo, SESSION_AGE, SESSION_COOKIE, tokenHash } from "./auth-contract";
import { emailMac, EmailAuthError } from "./email-core";
import { createPasswordStore } from "./password-store.mjs";
import { TEST_SESSION_COOKIE } from "./site-user";

export async function passwordLimit(request: Request, identity: string) {
  const secret = process.env.EMAIL_AUTH_SECRET;
  if (!secret || secret.length < 32) throw new EmailAuthError("not_ready", 503);
  const key = await emailMac(secret, identity);
  const ip = await emailMac(secret, request.headers.get("x-real-ip") || "unknown");
  if (!await createPasswordStore(env.DB!).limit([
    { key: `password:identity:${key}`, max: 10, window: 900000 },
    { key: `password:ip:${ip}`, max: 50, window: 900000 },
    { key: "password:global", max: 200, window: 60000 },
  ])) throw new EmailAuthError("password_rate_limited", 429);
}
export async function newPasswordSession() {
  const token = opaqueToken();
  return { token, hash: await tokenHash(token), expiresAt: Date.now() + SESSION_AGE * 1000 };
}
export async function passwordResponse(token: string, returnTo: unknown) {
  const jar = await cookies();
  const oldToken = jar.get(SESSION_COOKIE)?.value;
  if (oldToken) await authStore().revokeSession(await tokenHash(oldToken));
  const oldTest = jar.get(TEST_SESSION_COOKIE)?.value;
  if (oldTest) await env.DB!.prepare("DELETE FROM test_sessions WHERE token_hash=?").bind(await tokenHash(oldTest)).run();
  const response = Response.json({ ok: true, returnTo: safeReturnTo(typeof returnTo === "string" ? returnTo : null) }, { headers: { "Cache-Control": "no-store" } });
  response.headers.append("Set-Cookie", authCookie(SESSION_COOKIE, token, SESSION_AGE));
  response.headers.append("Set-Cookie", authCookie(TEST_SESSION_COOKIE, "", 0));
  return response;
}
export function passwordFailure(error: unknown) {
  const reason = error instanceof EmailAuthError ? error.reason : error instanceof Error ? error.message : "";
  const messages: Record<string, string> = {
    invalid_password: "密码须为 6–128 个字符。", invalid_credentials: "邮箱或密码错误。",
    wrong_password: "当前密码错误。", password_rate_limited: "尝试过于频繁，请 15 分钟后重试。",
    stale_password: "密码已变化，请重新登录。", invalid_request: "请求格式无效。", invalid_email: "请填写有效的邮箱地址。",
  };
  const status = reason === "password_rate_limited" ? 429 : ["invalid_credentials", "wrong_password", "stale_password"].includes(reason) ? 401 : reason in messages ? 400 : 503;
  return Response.json({ error: messages[reason] ?? "密码服务暂不可用，请稍后重试。" }, { status, headers: { "Cache-Control": "no-store", ...(status === 429 ? { "Retry-After": "900" } : {}) } });
}

import { cookies } from "next/headers";
import { env } from "@/db/binding";
import { authCookie, authStore, browserBinding } from "@/lib/auth-server";
import { formalAuth, SESSION_AGE, SESSION_COOKIE, tokenHash } from "@/lib/auth-contract";
import { TEST_SESSION_COOKIE } from "@/lib/site-user";
import { createEmailStore } from "@/lib/email-store.mjs";
import { completeEmail, EMAIL_FLOW_COOKIE, EMAIL_FLOW_PATH, EmailAuthError } from "@/lib/email-core";
import { emailFailure, emailPayload, emailReady, emailRequestAllowed } from "@/lib/email-server";
import { createPasswordStore } from "@/lib/password-store.mjs";

export async function POST(request: Request) {
  if (!formalAuth()) return new Response(null, { status: 404 });
  if (!emailRequestAllowed(request)) return Response.json({ error: "请从正式站点发起请求。" }, { status: 403, headers: { "Cache-Control": "no-store" } });
  try {
    if (!emailReady()) throw new EmailAuthError("not_ready", 503);
    const payload = await emailPayload(request);
    const jar = await cookies();
    const accounts = authStore();
    const result = await completeEmail({
      store: createEmailStore(env.DB!), accounts, secret: process.env.EMAIL_AUTH_SECRET!,
      passwords: createPasswordStore(env.DB!), password: payload.password,
      id: payload.challengeId, code: payload.code, cookie: jar.get(EMAIL_FLOW_COOKIE)?.value, browser: await browserBinding(),
    });
    const oldToken = jar.get(SESSION_COOKIE)?.value;
    const oldTest = jar.get(TEST_SESSION_COOKIE)?.value;
    if (oldToken) await accounts.revokeSession(await tokenHash(oldToken));
    if (oldTest) await env.DB!.prepare("DELETE FROM test_sessions WHERE token_hash = ?").bind(await tokenHash(oldTest)).run();
    const response = Response.json({ ok: true, returnTo: result.returnTo }, { headers: { "Cache-Control": "no-store" } });
    response.headers.append("Set-Cookie", authCookie(SESSION_COOKIE, result.token, SESSION_AGE));
    response.headers.append("Set-Cookie", authCookie(TEST_SESSION_COOKIE, "", 0));
    response.headers.append("Set-Cookie", authCookie(EMAIL_FLOW_COOKIE, "", 0, EMAIL_FLOW_PATH));
    return response;
  } catch (error) { return emailFailure(error); }
}

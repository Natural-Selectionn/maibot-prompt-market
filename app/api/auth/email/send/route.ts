import { env } from "@/db/binding";
import { authCookie, browserBinding } from "@/lib/auth-server";
import { formalAuth } from "@/lib/auth-contract";
import { createEmailStore } from "@/lib/email-store.mjs";
import { EMAIL_AGE, EMAIL_RETRY_AFTER, EMAIL_FLOW_COOKIE, EMAIL_FLOW_PATH, EmailAuthError, startEmail } from "@/lib/email-core";
import { emailFailure, emailPayload, emailReady, emailRequestAllowed, sendVerificationEmail } from "@/lib/email-server";
import { createPasswordStore } from "@/lib/password-store.mjs";

export async function POST(request: Request) {
  if (!formalAuth()) return new Response(null, { status: 404 });
  if (!emailRequestAllowed(request)) return Response.json({ error: "请从正式站点发起请求。" }, { status: 403, headers: { "Cache-Control": "no-store" } });
  try {
    if (!emailReady()) throw new EmailAuthError("not_ready", 503);
    const payload = await emailPayload(request);
    if (!["register", "reset", "link", "set-password"].includes(payload.purpose)) throw new EmailAuthError("invalid_request");
    const browser = await browserBinding();
    const details = payload.purpose === "set-password" && browser ? await createPasswordStore(env.DB!).details(browser.userId) : null;
    if (payload.purpose === "set-password" && !details?.address) throw new EmailAuthError("link_expired", 401);
    const result = await startEmail({
      store: createEmailStore(env.DB!), secret: process.env.EMAIL_AUTH_SECRET!,
      email: details?.address ?? payload.email, displayName: payload.displayName, returnTo: typeof payload.returnTo === "string" ? payload.returnTo : null,
      purpose: payload.purpose, link: payload.purpose === "link", browser,
      ip: request.headers.get("x-real-ip") || "unknown", send: sendVerificationEmail,
    });
    const response = Response.json({ challengeId: result.id, expiresIn: EMAIL_AGE, retryAfter: EMAIL_RETRY_AFTER }, { headers: { "Cache-Control": "no-store" } });
    response.headers.append("Set-Cookie", authCookie(EMAIL_FLOW_COOKIE, result.cookie, EMAIL_AGE, EMAIL_FLOW_PATH));
    return response;
  } catch (error) { return emailFailure(error); }
}

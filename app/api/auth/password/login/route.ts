import { env } from "@/db/binding";
import { formalAuth } from "@/lib/auth-contract";
import { normalizeEmail } from "@/lib/email-core";
import { emailPayload, emailRequestAllowed } from "@/lib/email-server";
import { verifyPassword } from "@/lib/password-core.mjs";
import { createPasswordStore } from "@/lib/password-store.mjs";
import { newPasswordSession, passwordFailure, passwordLimit, passwordResponse } from "@/lib/password-server";

export async function POST(request: Request) {
  if (!formalAuth()) return new Response(null, { status: 404 });
  if (!emailRequestAllowed(request)) return Response.json({ error: "请求来源无效。" }, { status: 403, headers: { "Cache-Control": "no-store" } });
  try {
    const payload = await emailPayload(request);
    const email = normalizeEmail(payload.email);
    await passwordLimit(request, email);
    const passwords = createPasswordStore(env.DB!);
    const account = await passwords.account(email);
    const valid = await verifyPassword(payload.password, account?.password_hash);
    if (!valid || !account || account.disabled) throw new Error("invalid_credentials");
    const session = await newPasswordSession();
    if (!await passwords.login(account.user_id, account.password_hash, session.hash, session.expiresAt)) throw new Error("invalid_credentials");
    return await passwordResponse(session.token, payload.returnTo);
  } catch (error) { return passwordFailure(error); }
}

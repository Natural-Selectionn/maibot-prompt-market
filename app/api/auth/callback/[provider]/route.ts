import { cookies } from "next/headers";
import { authOrigin, callbackPath, formalAuth, flowCookie, isProvider, SESSION_AGE, SESSION_COOKIE, tokenHash } from "@/lib/auth-contract";
import { authCookie, authRedirect, authStore, browserBinding } from "@/lib/auth-server";
import { completeAuthorization } from "@/lib/oauth-core";
import { verifyProvider } from "@/lib/oauth-provider";
import { TEST_SESSION_COOKIE } from "@/lib/site-user";
import { env } from "@/db/binding";

const publicErrors = new Set(["invalid_state", "flow_expired", "link_expired", "identity_conflict"]);

export async function GET(request: Request, context: { params: Promise<{ provider: string }> }) {
  const { provider } = await context.params;
  if (!formalAuth() || !isProvider(provider)) return new Response(null, { status: 404 });
  const jar = await cookies();
  const received = new URL(request.url);
  const state = received.searchParams.get("state");
  const callback = new URL(callbackPath(provider), authOrigin());
  callback.search = received.search;
  let response: Response;
  try {
    const store = authStore();
    const result = await completeAuthorization({
      store, provider, state, cookie: jar.get(flowCookie(provider))?.value,
      browser: await browserBinding(),
      verify: flow => verifyProvider(provider, flow, callback, state!),
    });
    const oldToken = jar.get(SESSION_COOKIE)?.value;
    const oldTest = jar.get(TEST_SESSION_COOKIE)?.value;
    if (oldToken) await store.revokeSession(await tokenHash(oldToken));
    if (oldTest) await env.DB!.prepare("DELETE FROM test_sessions WHERE token_hash = ?").bind(await tokenHash(oldTest)).run();
    response = authRedirect(result.returnTo);
    response.headers.append("Set-Cookie", authCookie(SESSION_COOKIE, result.token, SESSION_AGE));
    response.headers.append("Set-Cookie", authCookie(TEST_SESSION_COOKIE, "", 0));
  } catch (error) {
    const code = error instanceof Error && publicErrors.has(error.message) ? error.message : received.searchParams.has("error") ? "denied" : "failed";
    // Codes/tokens/provider response bodies must never enter logs or the UI.
    console.error("OAuth callback rejected", { provider, reason: code });
    response = authRedirect(`/account?auth_error=${code}`);
  }
  response.headers.append("Set-Cookie", authCookie(flowCookie(provider), "", 0, callbackPath(provider)));
  return response;
}

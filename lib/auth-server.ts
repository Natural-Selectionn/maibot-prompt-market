import { cookies } from "next/headers";
import { env } from "@/db/binding";
import { createAuthStore } from "./auth-store.mjs";
import { authOrigin, callbackPath, FLOW_AGE, flowCookie, opaqueToken, safeReturnTo, tokenHash, SESSION_COOKIE, type AuthProvider, type AuthStore } from "./auth-contract";
import { authorizationUrl } from "./oauth-provider";
import { getSiteUser, TEST_SESSION_COOKIE } from "./site-user";

export const authStore = (): AuthStore => createAuthStore(env.DB!);

export function authCookie(name: string, value: string, age: number, path = "/") {
  const secure = new URL(authOrigin()).protocol === "https:" ? "; Secure" : "";
  return `${name}=${value}; Path=${path}; Max-Age=${age}; HttpOnly; SameSite=Lax${secure}`;
}

export function authRedirect(path: string) {
  return new Response(null, { status: 303, headers: { Location: new URL(path, authOrigin()).href, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}

export async function browserBinding() {
  const user = await getSiteUser();
  if (!user) return null;
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value ?? jar.get(TEST_SESSION_COOKIE)?.value;
  return token ? { userId: user.userId, sessionHash: await tokenHash(token) } : null;
}

export async function startAuthorization(request: Request, provider: AuthProvider, link: boolean) {
  const url = new URL(request.url);
  // State cookies belong only to the canonical origin. A www/IP request must
  // navigate there before any flow is created or cookie is written.
  const forwarded = request.headers.get("x-forwarded-host") ?? url.host;
  if (forwarded !== new URL(authOrigin()).host) return link ? authRedirect("/account?auth_error=canonical") : authRedirect(`/api/auth/signin/${provider}?returnTo=${encodeURIComponent(safeReturnTo(url.searchParams.get("returnTo")))}`);
  const browser = link ? await browserBinding() : null;
  if (link && !browser) return authRedirect("/account?auth_error=link_expired");
  const state = opaqueToken();
  const verifier = opaqueToken();
  const nonce = opaqueToken();
  const target = await authorizationUrl(provider, state, verifier, nonce);
  await authStore().saveFlow({
    stateHash: await tokenHash(state), provider, codeVerifier: verifier, nonce,
    returnTo: link ? "/account?auth_linked=1" : safeReturnTo(url.searchParams.get("returnTo")),
    linkUserId: browser?.userId ?? null, linkSessionHash: browser?.sessionHash ?? null,
    expiresAt: Date.now() + FLOW_AGE * 1000,
  });
  const response = authRedirect(target.href);
  response.headers.append("Set-Cookie", authCookie(flowCookie(provider), state, FLOW_AGE, callbackPath(provider)));
  return response;
}

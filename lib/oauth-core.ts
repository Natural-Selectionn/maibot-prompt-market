import { opaqueToken, safeReturnTo, SESSION_AGE, tokenHash, type AuthFlow, type AuthIdentity, type AuthProvider, type AuthStore } from "./auth-contract.ts";

export type BrowserBinding = { userId: string; sessionHash: string } | null;

export async function completeAuthorization(options: {
  store: AuthStore; provider: AuthProvider; state: string | null; cookie: string | undefined;
  browser: BrowserBinding; verify: (flow: AuthFlow) => Promise<AuthIdentity>; now?: number;
}) {
  const { store, provider, state, cookie, browser, verify } = options;
  const now = options.now ?? Date.now();
  if (!state || !/^[a-f0-9]{64}$/.test(state) || cookie !== state) throw new Error("invalid_state");
  const flow = await store.takeFlow(await tokenHash(state), provider, now);
  if (!flow) throw new Error("flow_expired");
  if (flow.linkUserId && (!browser || browser.userId !== flow.linkUserId || browser.sessionHash !== flow.linkSessionHash)) throw new Error("link_expired");
  const identity = await verify(flow);
  if (identity.provider !== provider) throw new Error("invalid_identity");
  const userId = await store.resolveIdentity(identity, flow.linkUserId);
  const token = opaqueToken();
  await store.createSession(await tokenHash(token), userId, now + SESSION_AGE * 1000);
  return { token, returnTo: safeReturnTo(flow.returnTo), userId };
}

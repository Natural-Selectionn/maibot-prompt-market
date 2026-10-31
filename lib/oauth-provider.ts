import * as oidc from "openid-client";
import { authOrigin, callbackPath, type AuthFlow, type AuthIdentity, type AuthProvider } from "./auth-contract.ts";

const configurations = new Map<AuthProvider, { id: string; secret: string; promise: Promise<oidc.Configuration> }>();

function credentials(provider: AuthProvider) {
  const prefix = provider.toUpperCase();
  return { id: process.env[`${prefix}_CLIENT_ID`] || "", secret: process.env[`${prefix}_CLIENT_SECRET`] || "" };
}

export const providerReady = (provider: AuthProvider) => {
  const { id, secret } = credentials(provider);
  return !!id && !!secret;
};

async function configuration(provider: AuthProvider) {
  const { id, secret } = credentials(provider);
  if (!id || !secret) throw new Error("provider_not_ready");
  const previous = configurations.get(provider);
  if (previous?.id === id && previous.secret === secret) return previous.promise;
  const promise = (async () => {
    const config = provider === "google"
      ? await oidc.discovery(new URL("https://accounts.google.com"), id, secret, undefined, { timeout: 15 })
      : new oidc.Configuration({
        issuer: "https://github.com/login/oauth",
        authorization_endpoint: "https://github.com/login/oauth/authorize",
        token_endpoint: "https://github.com/login/oauth/access_token",
      }, id, secret);
    config.timeout = 15;
    if (provider === "google") oidc.enableNonRepudiationChecks(config);
    return config;
  })();
  configurations.set(provider, { id, secret, promise });
  promise.catch(() => { if (configurations.get(provider)?.promise === promise) configurations.delete(provider); });
  return promise;
}

export async function authorizationUrl(provider: AuthProvider, state: string, verifier: string, nonce: string) {
  const config = await configuration(provider);
  return oidc.buildAuthorizationUrl(config, {
    redirect_uri: authOrigin() + callbackPath(provider),
    scope: provider === "google" ? "openid profile email" : "read:user",
    state,
    code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
    code_challenge_method: "S256",
    ...(provider === "google" ? { nonce, prompt: "select_account" } : {}),
  });
}

export async function verifyProvider(provider: AuthProvider, flow: AuthFlow, callback: URL, state: string): Promise<AuthIdentity> {
  const config = await configuration(provider);
  const tokens = await oidc.authorizationCodeGrant(config, callback, {
    expectedState: state, pkceCodeVerifier: flow.codeVerifier,
    ...(provider === "google" ? { expectedNonce: flow.nonce, idTokenExpected: true } : {}),
  });
  if (provider === "google") {
    const claims = tokens.claims();
    if (!claims?.sub) throw new Error("invalid_identity");
    const profile = await oidc.fetchUserInfo(config, tokens.access_token, claims.sub);
    return { provider, subject: profile.sub, displayName: typeof profile.name === "string" ? profile.name : "麦麦用户" };
  }
  const response = await oidc.fetchProtectedResource(config, tokens.access_token, new URL("https://api.github.com/user"), "GET", undefined,
    new Headers({ Accept: "application/vnd.github+json", "User-Agent": "MaiBot-Prompt-Garden", "X-GitHub-Api-Version": "2022-11-28" }));
  if (!response.ok) throw new Error("provider_profile_failed");
  const profile = await response.json() as { id?: unknown; name?: unknown; login?: unknown };
  if (typeof profile.id !== "number" || !Number.isSafeInteger(profile.id) || profile.id <= 0) throw new Error("invalid_identity");
  return { provider, subject: String(profile.id), displayName: typeof profile.name === "string" && profile.name.trim() ? profile.name : typeof profile.login === "string" ? profile.login : "麦麦用户" };
}

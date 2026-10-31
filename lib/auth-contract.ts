export const providers = ["github", "google"] as const;
export type AuthProvider = typeof providers[number];
export type IdentityProvider = AuthProvider | "email";
export const SESSION_COOKIE = "mai_session";
export const SESSION_AGE = 7 * 86400;
export const FLOW_AGE = 600;
export const flowCookie = (provider: AuthProvider) => `mai_oauth_${provider}`;
export const callbackPath = (provider: AuthProvider) => `/api/auth/callback/${provider}`;
export const isProvider = (value: string): value is AuthProvider => providers.some(provider => provider === value);
export const opaqueToken = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, "0")).join("");

export async function tokenHash(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

export function safeReturnTo(value: string | null): string {
  if (!value || value.length > 2048 || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(value)) return "/account";
  const url = new URL(value, "https://return.invalid");
  if (url.origin !== "https://return.invalid" || url.pathname.startsWith("/api/auth") || /^\/(?:signin|signout)-with-chatgpt/.test(url.pathname)) return "/account";
  return `${url.pathname}${url.search}${url.hash}`;
}

export function authOrigin(): string {
  const url = new URL(process.env.AUTH_URL || "https://maiprompt.top");
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new Error("Invalid AUTH_URL");
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) throw new Error("AUTH_URL must use HTTPS");
  return url.origin;
}

export const formalAuth = () => process.env.MAIBOT_RUNTIME === "vps";
export const testLoginAllowed = () => !formalAuth() || process.env.MAIBOT_ALLOW_TEST_LOGIN === "1";

export type AuthIdentity = { provider: IdentityProvider; subject: string; displayName: string };
export type AuthFlow = { stateHash: string; provider: AuthProvider; codeVerifier: string; nonce: string; returnTo: string; linkUserId: string | null; linkSessionHash: string | null; expiresAt: number };
export type AuthSession = { userId: string; expiresAt: number };
export interface AuthStore {
  saveFlow(flow: AuthFlow): Promise<void>;
  takeFlow(stateHash: string, provider: AuthProvider, now: number): Promise<AuthFlow | null>;
  resolveIdentity(identity: AuthIdentity, linkUserId: string | null): Promise<string>;
  createSession(hash: string, userId: string, expiresAt: number): Promise<void>;
  session(hash: string, now: number): Promise<AuthSession | null>;
  revokeSession(hash: string): Promise<void>;
  linkedProviders(userId: string): Promise<IdentityProvider[]>;
}

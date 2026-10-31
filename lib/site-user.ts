import { and, eq, gt } from "drizzle-orm";
import { cookies } from "next/headers";
import { getDb } from "@/db";
import { testSessions } from "@/db/schema";
import { accountTag, getAccountProfile } from "@/lib/account-profiles";
import { requestOrigin } from "@/lib/request-origin";
import { SESSION_COOKIE, testLoginAllowed, tokenHash } from "@/lib/auth-contract";
import { createAuthStore } from "@/lib/auth-store.mjs";
import { env } from "@/db/binding";
import { PRIMARY_ADMIN_ACCOUNT_ID } from "@/lib/admin-policy.mjs";
export { tokenHash } from "@/lib/auth-contract";

export type SiteUser = { userId: string; displayName: string; kind: "test" | "oauth"; accountTag: string; disambiguated: boolean; role: "user" | "admin" };
export const publicUser = ({ displayName, kind, accountTag, disambiguated, role }: SiteUser) => ({ displayName, kind, accountTag, disambiguated, role, canManageAdmins: role === "admin" && Number(accountTag) === PRIMARY_ADMIN_ACCOUNT_ID });
export const TEST_SESSION_COOKIE = "mai_test_session";

export async function testSessionToken(): Promise<string | null> {
  const token = (await cookies()).get(TEST_SESSION_COOKIE)?.value;
  return token && /^[a-f0-9]{64}$/.test(token) ? token : null;
}

export async function getSiteUser(): Promise<SiteUser | null> {
  const sessionToken = (await cookies()).get(SESSION_COOKIE)?.value;
  if (sessionToken && /^[a-f0-9]{64}$/.test(sessionToken)) {
    const session = await createAuthStore(env.DB!).session(await tokenHash(sessionToken), Date.now());
    if (session) {
      const profile = await getAccountProfile(session.userId, "麦麦用户");
      if (profile.disabled) return null;
      return { userId: session.userId, displayName: profile.displayName, kind: "oauth", accountTag: accountTag(profile.id), disambiguated: profile.disambiguated, role: profile.role };
    }
  }
  // Closing the test entry also invalidates previously issued test cookies.
  if (!testLoginAllowed()) return null;
  const token = await testSessionToken();
  if (!token) return null;
  const [session] = await getDb().select().from(testSessions).where(and(eq(testSessions.tokenHash, await tokenHash(token)), gt(testSessions.expiresAt, Date.now()))).limit(1);
  if (!session) return null;
  const account = { userId: session.userId, displayName: session.displayName, kind: "test" as const };
  const profile = await getAccountProfile(account.userId, account.displayName);
  if (profile.disabled) return null;
  return { ...account, displayName: profile.displayName, accountTag: accountTag(profile.id), disambiguated: profile.disambiguated, role: profile.role };
}

export function sessionCookie(request: Request, token: string, maxAge = 604800): string {
  const secure = new URL(requestOrigin(request)).protocol === "https:" ? "; Secure" : "";
  return `${TEST_SESSION_COOKIE}=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure}`;
}

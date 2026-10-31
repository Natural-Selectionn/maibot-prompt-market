import { cookies } from "next/headers";
import { env } from "@/db/binding";
import { opaqueToken, tokenHash } from "@/lib/auth-contract";
import { requestOrigin } from "@/lib/request-origin";
import { createUsageStore } from "@/lib/usage-store.mjs";

export const VISITOR_COOKIE = "mai_usage_visitor";
export const usageStore = () => createUsageStore(env.DB!);

export function usageOriginAllowed(request: Request) {
  return request.headers.get("origin") === requestOrigin(request)
    && request.headers.get("sec-fetch-site") !== "cross-site";
}

export async function visitorHash() {
  const token = (await cookies()).get(VISITOR_COOKIE)?.value;
  return token && /^[a-f0-9]{64}$/.test(token) ? tokenHash(token) : null;
}

export async function ensureVisitor(request: Request, userId: string | null) {
  const store = usageStore();
  const hash = await visitorHash();
  const browser = hash ? await store.browser(hash) : null;
  // A different account on a shared browser gets a fresh anonymous identity;
  // never merge the previous account's history into it.
  if (browser && (!userId || !browser.user_id || browser.user_id === userId)) {
    if (userId) await store.claim(hash!, userId);
    return null;
  }
  const token = opaqueToken();
  const newHash = await tokenHash(token);
  await store.register(newHash, new Date().toISOString());
  if (userId) await store.claim(newHash, userId);
  const secure = new URL(requestOrigin(request)).protocol === "https:" ? "; Secure" : "";
  return `${VISITOR_COOKIE}=${token}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax${secure}`;
}

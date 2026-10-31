import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { testSessions } from "@/db/schema";
import { sameOrigin } from "@/lib/community";
import { getSiteUser, publicUser, sessionCookie, testSessionToken, tokenHash } from "@/lib/site-user";
import { accountTag, getAccountProfile } from "@/lib/account-profiles";
import { testLoginAllowed } from "@/lib/auth-contract";

export async function POST(request: Request) {
  if (!testLoginAllowed()) return Response.json({ error: "测试登录已关闭，请使用 GitHub 或 Google 登录。" }, { status: 410, headers: { "Cache-Control": "no-store" } });
  if (!sameOrigin(request)) return Response.json({ error: "请求来源无效。" }, { status: 403 });
  let displayName: string;
  try {
    const text = await request.text();
    if (text.length > 1024) throw new Error("too long");
    const payload = JSON.parse(text);
    displayName = typeof payload?.displayName === "string" ? payload.displayName.trim() : "";
    if (!displayName || displayName.length > 24) throw new Error("invalid name");
  } catch { return Response.json({ error: "请填写 1–24 字的账号昵称。" }, { status: 400 }); }
  try {
    const existing = await getSiteUser();
    if (existing) return Response.json({ user: publicUser(existing) }, { headers: { "Cache-Control": "no-store" } });
    const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, "0")).join("");
    const userId = `test:${crypto.randomUUID()}`;
    await getDb().insert(testSessions).values({ tokenHash: await tokenHash(token), userId, displayName, expiresAt: Date.now() + 604800000 });
    const profile = await getAccountProfile(userId, displayName);
    return Response.json({ user: { displayName, kind: "test", accountTag: accountTag(profile.id), disambiguated: profile.disambiguated, role: profile.role } }, { status: 201, headers: { "Cache-Control": "no-store", "Set-Cookie": sessionCookie(request, token) } });
  } catch (error) {
    console.error("Failed to start test session", error);
    return Response.json({ error: "登录失败，请稍后重试。" }, { status: 503 });
  }
}

export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "请求来源无效。" }, { status: 403 });
  try {
    const token = await testSessionToken();
    if (token) await getDb().delete(testSessions).where(eq(testSessions.tokenHash, await tokenHash(token)));
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store", "Set-Cookie": sessionCookie(request, "", 0) } });
  } catch (error) {
    console.error("Failed to end test session", error);
    return Response.json({ error: "退出失败，请稍后重试。" }, { status: 503 });
  }
}

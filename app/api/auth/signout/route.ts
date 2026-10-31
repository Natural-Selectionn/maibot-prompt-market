import { cookies } from "next/headers";
import { authCookie, authStore } from "@/lib/auth-server";
import { SESSION_COOKIE, tokenHash } from "@/lib/auth-contract";
import { TEST_SESSION_COOKIE } from "@/lib/site-user";
import { sameOrigin } from "@/lib/community";
import { env } from "@/db/binding";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "请求来源无效。" }, { status: 403 });
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  const test = jar.get(TEST_SESSION_COOKIE)?.value;
  if (token) await authStore().revokeSession(await tokenHash(token));
  if (test) await env.DB!.prepare("DELETE FROM test_sessions WHERE token_hash = ?").bind(await tokenHash(test)).run();
  const response = Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  response.headers.append("Set-Cookie", authCookie(SESSION_COOKIE, "", 0));
  response.headers.append("Set-Cookie", authCookie(TEST_SESSION_COOKIE, "", 0));
  return response;
}

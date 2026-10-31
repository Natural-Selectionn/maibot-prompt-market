import { getSiteUser } from "@/lib/site-user";
import { ensureVisitor, usageOriginAllowed } from "@/lib/usage-server";

export async function POST(request: Request) {
  if (!usageOriginAllowed(request)) return Response.json({ error: "请求来源无效。" }, { status: 403, headers: { "Cache-Control": "no-store" } });
  try {
    const user = await getSiteUser();
    const cookie = await ensureVisitor(request, user?.userId ?? null);
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store", ...(cookie ? { "Set-Cookie": cookie } : {}) } });
  } catch {
    return Response.json({ error: "统计暂不可用。" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

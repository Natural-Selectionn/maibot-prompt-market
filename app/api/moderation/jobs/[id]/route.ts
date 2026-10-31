import { getSiteUser } from "@/lib/site-user";
import { moderationQueue } from "@/lib/moderation-server";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const headers = { "Cache-Control": "no-store" };
  const user = await getSiteUser();
  if (!user) return Response.json({ error: "请先登录。" }, { status: 401, headers });
  try {
    const { id } = await context.params;
    const job = await moderationQueue().status(id, user.userId);
    return job ? Response.json({ job }, { headers }) : Response.json({ error: "审核记录不存在或已过期。" }, { status: 404, headers });
  } catch {
    return Response.json({ error: "暂时无法读取审核进度，请稍后重试。" }, { status: 503, headers });
  }
}

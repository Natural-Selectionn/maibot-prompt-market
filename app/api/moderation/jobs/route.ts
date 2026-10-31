import { env } from "@/db/binding";
import { getSiteUser } from "@/lib/site-user";
import { pendingSubmissions } from "@/lib/moderation-submissions.mjs";

export async function GET(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  const user = await getSiteUser();
  if (!user) return Response.json({ error: "请先登录。" }, { status: 401, headers });
  const kind = new URL(request.url).searchParams.get("kind") ?? "";
  if (!["", "config", "template"].includes(kind)) return Response.json({ error: "作品类型无效。" }, { status: 400, headers });
  try {
    const jobs = process.env.MAIBOT_RUNTIME === "vps" ? await pendingSubmissions(env.DB!, user.userId, kind) : [];
    return Response.json({ jobs }, { headers });
  } catch {
    return Response.json({ error: "待审核投稿暂时加载失败，请稍后重试。" }, { status: 503, headers });
  }
}

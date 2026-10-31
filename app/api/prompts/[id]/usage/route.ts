import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { prompts } from "@/db/schema";
import { getCommunityStats } from "@/lib/community";
import { getSiteUser } from "@/lib/site-user";
import { usageOriginAllowed, usageStore, visitorHash } from "@/lib/usage-server";

const json = (body: object, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!usageOriginAllowed(request)) return json({ error: "请求来源无效。" }, 403);
  if (Number(request.headers.get("content-length")) > 128) return json({ error: "内容太长。" }, 413);
  let action: "copy" | "download";
  try {
    const text = await request.text();
    if (text.length > 128) return json({ error: "内容太长。" }, 413);
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== "object" || !("action" in value) || (value.action !== "copy" && value.action !== "download")) return json({ error: "操作类型无效。" }, 400);
    action = value.action;
  } catch { return json({ error: "内容格式有误。" }, 400); }
  try {
    const { id } = await context.params;
    const [item] = await getDb().select({ kind: prompts.kind }).from(prompts).where(eq(prompts.id, id)).limit(1);
    if (!item) return json({ error: "作品不存在或已删除。" }, 404);
    if (action === "download" && !["config", "template"].includes(item.kind)) return json({ error: "该作品没有下载入口。" }, 400);
    const user = await getSiteUser();
    const hash = await visitorHash();
    const store = usageStore();
    if (!user && (!hash || !(await store.browser(hash)))) return json({ error: "请先初始化浏览器统计。" }, 428);
    await store.record({ promptId: id, action, userId: user?.userId ?? null, visitorHash: hash, now: new Date().toISOString() });
    const stats = await getCommunityStats([id]);
    return json({ stats: stats[id] });
  } catch (error) {
    console.error("Failed to record prompt usage", error);
    return json({ error: "统计暂不可用。" }, 503);
  }
}

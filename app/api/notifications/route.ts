import { getSiteUser } from "@/lib/site-user";
import { sameOrigin } from "@/lib/community";
import { notificationStore } from "@/lib/notification-server";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  const user = await getSiteUser();
  if (!user) return Response.json({ error: "请先登录。" }, { status: 401, headers });
  const params = new URL(request.url).searchParams;
  const before = params.get("before");
  if (before !== null && (!/^[1-9]\d{0,14}$/.test(before) || !Number.isSafeInteger(Number(before)))) return Response.json({ error: "分页参数无效。" }, { status: 400, headers });
  try {
    const store = notificationStore();
    return Response.json(params.get("count") === "1" ? { unreadCount: await store.count(user.userId) } : await store.list(user.userId, before ? Number(before) : null), { headers });
  } catch (error) {
    console.error("Notification read failed", error);
    return Response.json({ error: "消息暂时加载失败，请重试。" }, { status: 503, headers });
  }
}

export async function PATCH(request: Request) {
  const user = await getSiteUser();
  if (!user) return Response.json({ error: "请先登录。" }, { status: 401, headers });
  if (!sameOrigin(request)) return Response.json({ error: "请求来源无效。" }, { status: 403, headers });
  let payload: { id?: number; through?: number };
  try {
    const text = await request.text();
    if (text.length>256) throw new Error();
    payload = JSON.parse(text);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error();
    if (Object.keys(payload).length !== 1 || ![payload.id,payload.through].some(value => typeof value === "number" && Number.isSafeInteger(value) && value >= 0)) throw new Error();
    if (payload.id !== undefined && payload.id < 1) throw new Error();
  } catch { return Response.json({ error: "已读参数无效。" }, { status: 400, headers }); }
  try {
    const store = notificationStore();
    if (payload.id !== undefined) {
      if (!await store.read(user.userId,payload.id)) return Response.json({ error: "消息不存在。" }, { status: 404, headers });
    } else await store.readAll(user.userId,payload.through!);
    return Response.json({ unreadCount: await store.count(user.userId) }, { headers });
  } catch (error) {
    console.error("Notification update failed", error);
    return Response.json({ error: "标记已读失败，请重试。" }, { status: 503, headers });
  }
}

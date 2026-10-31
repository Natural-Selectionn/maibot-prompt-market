import { and, eq, isNull } from "drizzle-orm";
import { getSiteUser } from "@/lib/site-user";
import { getDb } from "@/db";
import { comments } from "@/db/schema";
import { sameOrigin } from "@/lib/community";

export async function DELETE(request: Request, context: { params: Promise<{ id: string; commentId: string }> }) {
  const user = await getSiteUser();
  if (!user) return Response.json({ error: "请先登录。" }, { status: 401 });
  if (!sameOrigin(request)) return Response.json({ error: "请求来源无效。" }, { status: 403 });
  const { id, commentId } = await context.params;
  try {
    // Keep the thread structure and other users' replies, but erase this body.
    const removed = await getDb().update(comments).set({ body: "", deletedAt: new Date().toISOString() }).where(and(eq(comments.id, commentId), eq(comments.promptId, id), eq(comments.userId, user.userId), isNull(comments.deletedAt))).returning({ id: comments.id });
    if (!removed.length) return Response.json({ error: "评论不存在或无权删除。" }, { status: 404 });
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Failed to delete comment", error);
    return Response.json({ error: "删除失败，请稍后重试。" }, { status: 503 });
  }
}

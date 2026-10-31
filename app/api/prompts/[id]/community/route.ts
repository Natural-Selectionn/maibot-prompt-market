import { and, asc, desc, eq, isNull, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { env } from "@/db/binding";
import { getSiteUser } from "@/lib/site-user";
import { getDb } from "@/db";
import { comments, prompts, ratings } from "@/db/schema";
import { getCommunityStats, isSampleId, sameOrigin } from "@/lib/community";
import { publicComment } from "@/lib/discussion";
import { notificationStore } from "@/lib/notification-server";
import { authorMetadata } from "@/lib/account-profiles";

const PAGE_SIZE = 20;

async function itemExists(id: string) {
  if (isSampleId(id)) return { ownerId: null };
  return (await getDb().select({ ownerId: prompts.ownerId }).from(prompts).where(eq(prompts.id, id)).limit(1))[0];
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const user = await getSiteUser();
  const params = new URL(request.url).searchParams;
  let offset = Math.max(0, Math.min(100000, Number.parseInt(params.get("offset") ?? "0", 10) || 0));
  try {
    const item = await itemExists(id);
    if (!item) return Response.json({ error: "作品不存在或已删除。" }, { status: 404 });
    const db = getDb();
    const threadId = params.get("thread");
    if (threadId !== null) {
      const [root] = await db.select({ id: comments.id }).from(comments).where(and(eq(comments.id, threadId), eq(comments.promptId, id), isNull(comments.rootId))).limit(1);
      if (!root) return Response.json({ error: "评论不存在。" }, { status: 404 });
      const where = and(eq(comments.promptId, id), eq(comments.rootId, root.id));
      const [count] = await db.select({ total: sql<number>`count(*)` }).from(comments).where(where);
      const total = Number(count.total);
      if (params.get("last") === "1") offset = Math.floor(Math.max(0, total - 1) / PAGE_SIZE) * PAGE_SIZE;
      const target = alias(comments, "reply_target");
      const rows = await db.select({ comment: comments, target: { id: target.id, userId: target.userId, author: target.author, deletedAt: target.deletedAt } }).from(comments)
        .leftJoin(target, and(eq(target.id, comments.replyToId), eq(target.promptId, id)))
        .where(where).orderBy(asc(comments.createdAt), asc(comments.id)).limit(PAGE_SIZE + 1).offset(offset);
      const actors = rows.slice(0, PAGE_SIZE).flatMap(row => [row.comment, ...(row.target ? [row.target] : [])]);
      const authors = await authorMetadata(actors.filter(actor => !actor.deletedAt));
      return Response.json({ replies: rows.slice(0, PAGE_SIZE).map(row => publicComment(row.comment, item.ownerId, user?.userId, row.target, authors)), total, offset, hasMore: rows.length > PAGE_SIZE }, { headers: { "Cache-Control": "no-store" } });
    }
    const [summary, rows, myRating] = await Promise.all([
      getCommunityStats([id]),
      db.select({ comment: comments, replyCount: sql<number>`(SELECT count(*) FROM prompt_comments AS reply WHERE reply.prompt_id = "prompt_comments"."prompt_id" AND reply.root_id = "prompt_comments"."id")` }).from(comments)
        .where(and(eq(comments.promptId, id), isNull(comments.rootId), ...(params.get("root") ? [eq(comments.id, params.get("root")!)] : []), or(isNull(comments.deletedAt), sql`EXISTS (SELECT 1 FROM prompt_comments AS reply WHERE reply.prompt_id = ${comments.promptId} AND reply.root_id = ${comments.id} AND reply.deleted_at IS NULL)`)))
        .orderBy(desc(comments.createdAt), desc(comments.id)).limit(PAGE_SIZE + 1).offset(offset),
      user ? db.select({ score: ratings.score }).from(ratings).where(and(eq(ratings.promptId, id), eq(ratings.userId, user.userId))).limit(1) : Promise.resolve([]),
    ]);
    const authors = await authorMetadata(rows.slice(0, PAGE_SIZE).map(row => row.comment).filter(comment => !comment.deletedAt));
    return Response.json({ stats: summary[id], myRating: myRating[0]?.score ?? null, comments: rows.slice(0, PAGE_SIZE).map(({ comment, replyCount }) => ({ ...publicComment(comment, item.ownerId, user?.userId, null, authors), replyCount: Number(replyCount) })), hasMore: rows.length > PAGE_SIZE }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Failed to load discussion", error);
    return Response.json({ error: "讨论暂时加载失败。" }, { status: 503 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getSiteUser();
  if (!user) return Response.json({ error: "请先登录。" }, { status: 401 });
  if (!sameOrigin(request)) return Response.json({ error: "请求来源无效。" }, { status: 403 });
  if (Number(request.headers.get("content-length")) > 5000) return Response.json({ error: "内容太长。" }, { status: 413 });
  let payload: Record<string, unknown>;
  try {
    const text = await request.text();
    if (text.length > 5000) return Response.json({ error: "内容太长。" }, { status: 413 });
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid");
    payload = parsed as Record<string, unknown>;
  } catch { return Response.json({ error: "内容格式有误。" }, { status: 400 }); }
  const { id } = await context.params;
  try {
    if (!env.DB) throw new Error("D1 unavailable");
    const sample = isSampleId(id);
    const store = notificationStore();
    if (payload.type === "rating") {
      if (typeof payload.score !== "number" || !Number.isInteger(payload.score) || payload.score < 1 || payload.score > 5) return Response.json({ error: "评分需要为 1 到 5 星。" }, { status: 400 });
      await store.rate(id,user.userId,payload.score,sample);
    } else if (payload.type === "comment") {
      const body = typeof payload.body === "string" ? payload.body.trim() : "";
      if (!body || body.length>1000) return Response.json({ error: "评论需为 1–1000 字。" }, { status: 400 });
      if (payload.replyToId != null && (typeof payload.replyToId !== "string" || !payload.replyToId || payload.replyToId.length>80)) return Response.json({ error: "回复目标无效。" }, { status: 400 });
      if (payload.operationKey != null && (typeof payload.operationKey !== "string" || !/^[a-zA-Z0-9-]{16,80}$/.test(payload.operationKey))) return Response.json({ error: "提交标识无效。" }, { status: 400 });
      const result = await store.comment({ promptId: id, actor: user.userId, author: user.displayName, body,
        replyToId: typeof payload.replyToId === "string" ? payload.replyToId : null,
        operationKey: typeof payload.operationKey === "string" ? payload.operationKey : null, sample });
      return Response.json({ ok: true, ...result });
    } else return Response.json({ error: "操作类型无效。" }, { status: 400 });
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "not_found") return Response.json({ error: "作品或回复目标不存在或已删除。" }, { status: 404 });
      if (error.message === "operation_conflict") return Response.json({ error: "该提交已处理，请刷新后重试。" }, { status: 409 });
      if (error.message === "rate_limited") return Response.json({ error: "评论过于频繁，请稍后再试。" }, { status: 429, headers: { "Retry-After": "60" } });
    }
    console.error("Failed to save discussion", error);
    return Response.json({ error: "提交失败，请稍后重试。" }, { status: 503 });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getSiteUser();
  if (!user) return Response.json({ error: "请先登录。" }, { status: 401 });
  if (!sameOrigin(request)) return Response.json({ error: "请求来源无效。" }, { status: 403 });
  const { id } = await context.params;
  try {
    await notificationStore().withdrawRating(id,user.userId);
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Failed to remove rating", error);
    return Response.json({ error: "撤回评分失败。" }, { status: 503 });
  }
}

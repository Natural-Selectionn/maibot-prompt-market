import { and, eq, sql } from "drizzle-orm";
import { env } from "@/db/binding";
import { getDb } from "@/db";
import { prompts } from "@/db/schema";
import { sameOrigin } from "@/lib/community";
import { getSiteUser } from "@/lib/site-user";
import { sharedConfigFields, templateFilesFor, validatePrompt } from "@/lib/prompts";
import { readPromptRequestText } from "@/lib/prompt-request";
import { versionRangeStorage } from "@/lib/version-range.mjs";
import { authorMetadata } from "@/lib/account-profiles";
import { moderatePublication, enqueuePublication } from "@/lib/moderation-server";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const user = await getSiteUser();
  try {
    const [row] = await getDb().select().from(prompts).where(eq(prompts.id, id)).limit(1);
    if (!row) return Response.json({ error: "作品不存在或已删除。" }, { status: 404 });
    const { ownerId, minVersionKey, maxVersionKey, tags, fields, templateFiles, ...item } = row;
    const authors = await authorMetadata([{ userId: ownerId, author: row.author }]);
    return Response.json({ item: { ...item, templateFiles: templateFilesFor({ ...item, templateFiles: JSON.parse(templateFiles) }), ...authors.get(ownerId), category: item.kind === "config" ? "" : item.category, scene: "", tags: JSON.parse(tags), fields: sharedConfigFields(JSON.parse(fields)), mine: !!user && user.userId === ownerId } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Failed to load prompt", error);
    return Response.json({ error: "作品暂时加载失败，请稍后重试。" }, { status: 503 });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return Response.json({ error: "请求来源无效。" }, { status: 403 });
  const user = await getSiteUser();
  if (!user) return Response.json({ error: "请先登录。" }, { status: 401 });
  const { id } = await context.params;
  try {
    if (!env.DB) throw new Error("D1 unavailable");
    // D1 batch is atomic: related posts cannot outlive an owned deletion.
    const results = await env.DB.batch([
      env.DB.prepare("DELETE FROM prompt_comments WHERE prompt_id = ? AND EXISTS (SELECT 1 FROM prompts WHERE id = ? AND owner_id = ?)").bind(id, id, user.userId),
      env.DB.prepare("DELETE FROM prompt_ratings WHERE prompt_id = ? AND EXISTS (SELECT 1 FROM prompts WHERE id = ? AND owner_id = ?)").bind(id, id, user.userId),
      env.DB.prepare("DELETE FROM prompts WHERE id = ? AND owner_id = ?").bind(id, user.userId),
    ]);
    if (!results[2].meta.changes) return Response.json({ error: "作品不存在或无权删除。" }, { status: 404 });
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Failed to delete prompt", error);
    return Response.json({ error: "删除失败，请稍后重试。" }, { status: 503 });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getSiteUser();
  if (!user) return Response.json({ error: "请先登录。" }, { status: 401 });
  if (!sameOrigin(request)) return Response.json({ error: "请求来源无效。" }, { status: 403 });
  let payload: Record<string, unknown>;
  try {
    const text = await readPromptRequestText(request);
    if (text === null) return Response.json({ error: "请求内容不能超过 2 MiB。" }, { status: 413 });
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid");
    payload = parsed as Record<string, unknown>;
  } catch { return Response.json({ error: "内容格式有误。" }, { status: 400 }); }
  const { id } = await context.params;
  try {
    const db = getDb();
    const [existing] = await db.select({ kind: prompts.kind, createdAt: prompts.createdAt, updatedAt: prompts.updatedAt }).from(prompts).where(and(eq(prompts.id, id), eq(prompts.ownerId, user.userId))).limit(1);
    if (!existing) return Response.json({ error: "作品不存在或无权修改。" }, { status: 404 });
    if (payload.kind !== undefined && payload.kind !== existing.kind) return Response.json({ error: "编辑时不能更改作品类型。" }, { status: 400 });
    if (typeof payload.revision !== "string" || !payload.revision || payload.revision.length > 40) return Response.json({ error: "请重新打开作品后修改。" }, { status: 400 });
    const { data, error } = validatePrompt({ ...payload, kind: existing.kind, author: user.displayName });
    if (!data) return Response.json({ error }, { status: 400 });
    if (payload.revision !== (existing.updatedAt ?? existing.createdAt)) return Response.json({ error: "作品已在其他页面更新，请重新打开后修改。" }, { status: 409 });
    const queued = await enqueuePublication(request, data, id, "update", user.userId, payload.revision);
    if (queued) return queued;
    const rejected = await moderatePublication(data, id, "update");
    if (rejected) return rejected;
    if (!await getSiteUser()) return Response.json({ error: "登录状态已变化，请重新登录。" }, { status: 401 });
    const updatedAt = new Date().toISOString();
    const changes = { ...data, ...versionRangeStorage(data), templateFiles: JSON.stringify(data.templateFiles ?? []), templateName: data.templateName ?? "", templateLocale: data.templateLocale ?? "", templateContent: data.templateContent ?? "", templateBasis: data.templateBasis ?? "unverified", tags: JSON.stringify(data.tags), fields: JSON.stringify(data.fields), updatedAt };
    const updated = await db.update(prompts).set(changes).where(and(eq(prompts.id, id), eq(prompts.ownerId, user.userId), sql`coalesce(${prompts.updatedAt}, ${prompts.createdAt}) = ${payload.revision}`)).returning({ id: prompts.id });
    if (!updated.length) return Response.json({ error: "作品已在其他页面更新或删除，请重新打开后修改。" }, { status: 409 });
    return Response.json({ item: { ...data, authorProfileTag: user.accountTag, authorTag: user.disambiguated ? user.accountTag : "", id, createdAt: existing.createdAt, updatedAt, mine: true } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Failed to update prompt", error);
    return Response.json({ error: "保存失败，请稍后重试。" }, { status: 503 });
  }
}

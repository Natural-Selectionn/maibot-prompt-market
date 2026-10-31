import { and, desc, eq, gte, isNull, lte, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { prompts, userProfiles } from "@/db/schema";
import { getCommunityStats, sameOrigin } from "@/lib/community";
import { isValidVersion, samples, sharedConfigFields, templateCategories, templateFilesFor, validatePrompt } from "@/lib/prompts";
import { readPromptRequestText } from "@/lib/prompt-request";
import { getSiteUser } from "@/lib/site-user";
import { authorMetadata } from "@/lib/account-profiles";
import { isPromptSort } from "@/lib/prompt-sort";
import { promptOrder } from "@/lib/prompt-order";
import { moderatePublication, enqueuePublication } from "@/lib/moderation-server";

import { versionKey, versionRangeStorage } from "@/lib/version-range.mjs";
import { promptSearchMatch, relevanceScore, searchClauses } from "@/lib/search-query";

const PAGE_SIZE = 24;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").trim().slice(0, 80);
  const tags = [...new Set(url.searchParams.getAll("tag").map(tag => tag.trim().slice(0, 12)).filter(Boolean))].slice(0, 5);
  const kind = url.searchParams.get("kind") ?? "";
  const category = url.searchParams.get("category") ?? "";
  const version = (url.searchParams.get("version") ?? "").trim();
  const sort = url.searchParams.get("sort") ?? (query ? "relevance" : "latest");
  if (!isPromptSort(sort)) return Response.json({ error: "排序方式无效。" }, { status: 400 });
  if (version && !isValidVersion(version)) return Response.json({ error: "版本格式无效。" }, { status: 400 });
  const offset = Math.max(0, Math.min(100000, Number.parseInt(url.searchParams.get("offset") ?? "0", 10) || 0));
  const clauses = [];
  if (["config", "template"].includes(kind)) clauses.push(eq(prompts.kind, kind));
  if (kind !== "config" && templateCategories.some(value => value === category)) clauses.push(and(eq(prompts.kind, "template"), eq(prompts.category, category))!);
  if (version) {
    const key = versionKey(version);
    clauses.push(lte(prompts.minVersionKey, key), or(isNull(prompts.maxVersionKey), gte(prompts.maxVersionKey, key))!);
  }
  for (const tag of tags) clauses.push(sql`EXISTS (SELECT 1 FROM json_each(${prompts.tags}) AS tag WHERE tag.value = ${tag} COLLATE NOCASE)`);
  clauses.push(...searchClauses(query));
  const searchTags = tags;
  try {
    const user = await getSiteUser();
    if (url.searchParams.get("mine") === "1") {
      if (!user) return Response.json({ error: "请先登录。" }, { status: 401 });
      clauses.push(eq(prompts.ownerId, user.userId));
    }
    const author = url.searchParams.get("author");
    if (author !== null) {
      if (!/^\d{1,10}$/.test(author) || Number(author)<1) return Response.json({ error: "作者编号无效。" }, { status: 400 });
      const [profile] = await getDb().select({ userId: userProfiles.userId }).from(userProfiles).where(and(eq(userProfiles.id,Number(author)),eq(userProfiles.disabled,false))).limit(1);
      if (!profile) return Response.json({ error: "用户不存在或暂不可用。" }, { status: 404 });
      clauses.push(eq(prompts.ownerId,profile.userId));
    }
    const rows = await getDb().select().from(prompts).where(clauses.length ? and(...clauses) : undefined)
      .orderBy(...(sort === "relevance" ? [desc(relevanceScore(query)), ...promptOrder("combined")] : promptOrder(sort))).limit(PAGE_SIZE + 1).offset(offset);
    const authors = await authorMetadata(rows.slice(0, PAGE_SIZE).map(row => ({ userId: row.ownerId, author: row.author })));
    const items = rows.slice(0, PAGE_SIZE).map(({ ownerId, minVersionKey, maxVersionKey, tags, fields, templateContent, templateFiles, ...row }) => ({
      ...row, ...authors.get(ownerId), category: row.kind === "config" ? "" : row.category, scene: "", tags: JSON.parse(tags), fields: sharedConfigFields(JSON.parse(fields)), templateContent: templateContent.slice(0, 180),
      templateFiles: templateFilesFor({ ...row, templateContent, templateFiles: JSON.parse(templateFiles) }).map(file => ({ ...file, content: file.content.slice(0, 180) })), mine: !!user && user.userId === ownerId,
      searchMatch: promptSearchMatch({ ...row, tags: JSON.parse(tags), fields: JSON.parse(fields), templateContent, templateFiles: JSON.parse(templateFiles) }, query, searchTags),
    }));
    const stats = await getCommunityStats([...items.map(item => item.id), ...samples.map(item => item.id)]);
    return Response.json({ items, stats, hasMore: rows.length > PAGE_SIZE }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Failed to load prompt library", error);
    return Response.json({ error: "作品暂时加载失败，请稍后重试。" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const user = await getSiteUser();
  if (!user) return Response.json({ error: "请先登录后发布。" }, { status: 401 });
  if (!sameOrigin(request)) return Response.json({ error: "请求来源无效。" }, { status: 403 });
  let payload: unknown;
  try {
    const text = await readPromptRequestText(request);
    if (text === null) return Response.json({ error: "请求内容不能超过 2 MiB。" }, { status: 413 });
    payload = JSON.parse(text);
  } catch { return Response.json({ error: "内容格式有误。" }, { status: 400 }); }
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const item = payload as Record<string, unknown>;
    item.author = user.displayName;
  }
  const { data, error } = validatePrompt(payload);
  if (!data) return Response.json({ error }, { status: 400 });
  try {
    const row = { ...data, ...versionRangeStorage(data), templateFiles: JSON.stringify(data.templateFiles ?? []), templateName: data.templateName ?? "", templateLocale: data.templateLocale ?? "", templateContent: data.templateContent ?? "", templateBasis: data.templateBasis ?? "unverified", id: crypto.randomUUID(), ownerId: user.userId, createdAt: new Date().toISOString(), tags: JSON.stringify(data.tags), fields: JSON.stringify(data.fields) };
    const queued = await enqueuePublication(request, data, row.id, "create", user.userId);
    if (queued) return queued;
    const rejected = await moderatePublication(data, row.id, "create");
    if (rejected) return rejected;
    if (!await getSiteUser()) return Response.json({ error: "登录状态已变化，请重新登录。" }, { status: 401 });
    await getDb().insert(prompts).values(row);
    return Response.json({ item: { ...data, authorProfileTag: user.accountTag, authorTag: user.disambiguated ? user.accountTag : "", id: row.id, createdAt: row.createdAt, mine: true } }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Failed to publish prompt", error);
    return Response.json({ error: "发布失败，请稍后重试。" }, { status: 503 });
  }
}

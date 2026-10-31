import { env } from "@/db/binding";
import { escapeLike } from "@/lib/search";

export async function GET(request: Request) {
  try {
    if (!env.DB) throw new Error("D1 unavailable");
    const params = new URL(request.url).searchParams;
    const query = (params.get("q") ?? "").trim().slice(0, 12);
    const kind = params.get("kind") ?? "";
    const clauses = ["json_valid(prompts.tags)", "tag.type = 'text'"];
    const bindings: string[] = [];
    if (["config", "template"].includes(kind)) { clauses.push("prompts.kind = ?"); bindings.push(kind); }
    if (query) { clauses.push("tag.value LIKE ? ESCAPE '\\'"); bindings.push(`%${escapeLike(query)}%`); }
    const order = query ? "CASE WHEN tag.value = ? COLLATE NOCASE THEN 0 WHEN tag.value LIKE ? ESCAPE '\\' THEN 1 ELSE 2 END, " : "";
    if (query) bindings.push(query, `${escapeLike(query)}%`);
    const statement = env.DB.prepare(`SELECT tag.value AS tag, COUNT(DISTINCT prompts.id) AS count FROM prompts, json_each(prompts.tags) AS tag WHERE ${clauses.join(" AND ")} GROUP BY tag.value COLLATE NOCASE ORDER BY ${order}count DESC, tag.value LIMIT 30`);
    const result = await statement.bind(...bindings).all<{ tag: string; count: number }>();
    return Response.json({ tags: result.results }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Failed to load tags", error);
    return Response.json({ error: "标签暂时加载失败。" }, { status: 503 });
  }
}

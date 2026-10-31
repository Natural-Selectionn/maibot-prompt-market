import { or, sql, type SQL, type SQLWrapper } from "drizzle-orm";
import { prompts } from "../db/schema.ts";
import { searchPattern, searchTerms, searchExcerpt, type SearchMatch } from "./search.ts";
import { fieldLabels, sharedConfigFields, templateFilesFor, type PromptItem } from "./prompts.ts";

const like = (column: SQLWrapper, pattern: string | SQL) => sql`${column} LIKE ${pattern} ESCAPE '\\'`;
function buckets(pattern: string | SQL): SQL[] {
  return [
    like(prompts.title, pattern),
    sql`EXISTS (SELECT 1 FROM json_each(${prompts.tags}) AS t WHERE ${like(sql`t.value`, pattern)})`,
    sql`(${like(prompts.templateName, pattern)} OR EXISTS (SELECT 1 FROM json_each(${prompts.templateFiles}) AS f WHERE ${like(sql`json_extract(f.value, '$.name')`, pattern)}))`,
    like(prompts.author, pattern), like(prompts.description, pattern),
    sql`EXISTS (SELECT 1 FROM json_each(${prompts.fields}) AS v WHERE v.key IN (${sql.raw(Object.keys(fieldLabels).map(key => `'${key}'`).join(","))}) AND ${like(sql`v.value`, pattern)})`,
    sql`(${like(prompts.templateContent, pattern)} OR EXISTS (SELECT 1 FROM json_each(${prompts.templateFiles}) AS f WHERE ${like(sql`json_extract(f.value, '$.content')`, pattern)}))`,
  ];
}
export function searchClauses(query: string): SQL[] {
  return searchTerms(query).map(term => or(...buckets(searchPattern(term)))!);
}
// Rank the complete filtered set in the database, before LIMIT/OFFSET.
export function relevanceScore(query: string): SQL {
  const terms = searchTerms(query);
  if (!terms.length) return sql`(0 + 0)`;
  // Bind the term list once, keeping five-word requests within D1's parameter limit.
  const term = sql`search_term.value`;
  const pattern = sql`('%' || replace(replace(replace(${term}, '\\', '\\\\'), '%', '\\%'), '_', '\\_') || '%')`;
  const weights = [120, 110, 90, 65, 50, 35, 25];
  return sql`((CASE WHEN ${prompts.title} = ${terms.join(" ")} COLLATE NOCASE THEN 1000 ELSE 0 END) +
    (SELECT coalesce(sum(CASE
      WHEN ${prompts.title} = ${term} COLLATE NOCASE THEN 180
      WHEN EXISTS (SELECT 1 FROM json_each(${prompts.tags}) AS t WHERE t.value = ${term} COLLATE NOCASE) THEN 160
      ${sql.join(buckets(pattern).map((condition, index) => sql`WHEN ${condition} THEN ${sql.raw(String(weights[index]))}`), sql` `)}
      ELSE 1 END), 0) FROM json_each(${JSON.stringify(terms)}) AS search_term))`;
}

export function promptSearchMatch(item: Pick<PromptItem, "title" | "tags" | "author" | "description" | "fields" | "templateFiles" | "templateName" | "templateContent"> & { kind: string }, query: string, tags: string[]): SearchMatch | undefined {
  const terms = searchTerms(query);
  if (!terms.length) return tags.length ? searchExcerpt("标签", item.tags.join(" · "), tags) : undefined;
  const files = templateFilesFor(item);
  const values: [string, string][] = [
    ["作品名称", item.title], ...item.tags.map(tag => ["标签", tag] as [string, string]),
    ...files.map(file => ["文件名", file.name] as [string, string]), ["作者", item.author], ["简介", item.description],
    ...Object.entries(sharedConfigFields(item.fields)).map(([key, value]) => [fieldLabels[key as keyof typeof fieldLabels], Array.isArray(value) ? value.join(" / ") : String(value)] as [string, string]),
    ...files.map((file, index) => [`${file.name || `文件 ${index + 1}`} · 正文`, file.content] as [string, string]),
  ];
  // Prefer a contiguous match over a scattered match, then stronger fields.
  const ordered = [...values.filter(([, value]) => terms.some(term => value.toLowerCase().includes(term.toLowerCase()))), ...values];
  for (const [label, value] of ordered) {
    const result = searchExcerpt(label, value, terms);
    if (result) return result;
  }
}

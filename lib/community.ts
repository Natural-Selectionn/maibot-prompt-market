import { and, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { comments, ratings, promptUsage } from "@/db/schema";
import { samples, type CommunityStats } from "@/lib/prompts";
import { requestOrigin } from "@/lib/request-origin";

export const isSampleId = (id: string) => samples.some(item => item.id === id);

export async function getCommunityStats(ids: string[]): Promise<Record<string, CommunityStats>> {
  const unique = [...new Set(ids)];
  if (!unique.length) return {};
  const db = getDb();
  const [ratingRows, commentRows, usageRows] = await Promise.all([
    db.select({ id: ratings.promptId, average: sql<number>`avg(${ratings.score})`, count: sql<number>`count(*)` })
      .from(ratings).where(inArray(ratings.promptId, unique)).groupBy(ratings.promptId),
    db.select({ id: comments.promptId, count: sql<number>`count(*)` })
      .from(comments).where(and(inArray(comments.promptId, unique), isNull(comments.deletedAt))).groupBy(comments.promptId),
    db.select({ id: promptUsage.promptId, action: promptUsage.action, count: sql<number>`count(*)` })
      .from(promptUsage).where(inArray(promptUsage.promptId, unique)).groupBy(promptUsage.promptId, promptUsage.action),
  ]);
  const result: Record<string, CommunityStats> = {};
  for (const id of unique) result[id] = { average: null, ratingsCount: 0, commentCount: 0, copyCount: 0, downloadCount: 0 };
  for (const row of ratingRows) result[row.id] = { ...result[row.id], average: Number(row.average), ratingsCount: Number(row.count) };
  for (const row of commentRows) result[row.id] = { ...result[row.id], commentCount: Number(row.count) };
  for (const row of usageRows) result[row.id] = { ...result[row.id], [row.action === "copy" ? "copyCount" : "downloadCount"]: Number(row.count) };
  return result;
}

export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  return !origin || origin === requestOrigin(request);
}

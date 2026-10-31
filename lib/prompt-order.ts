import { desc, sql, type SQL } from "drizzle-orm";
import { prompts } from "../db/schema";
import { rankingPolicy as policy, type PromptSort } from "./prompt-sort";

/** Rank the whole filtered catalog in SQLite/D1 before applying pagination. */
export function promptOrder(sort: PromptSort, now = new Date()): SQL[] {
  const newest = [desc(prompts.createdAt), desc(prompts.id)];
  if (sort === "latest") return newest;

  const votes = sql<number>`(SELECT count(*) FROM prompt_ratings AS sort_rating WHERE sort_rating.prompt_id = ${prompts.id})`;
  const total = sql<number>`(SELECT coalesce(sum(sort_rating.score), 0) FROM prompt_ratings AS sort_rating WHERE sort_rating.prompt_id = ${prompts.id})`;
  // Five neutral 3-star observations provide a stable cold start. Unrated
  // works have exactly that neutral score rather than a special last place.
  const quality = sql<number>`(1.0 * ${total} + ${policy.priorMean * policy.priorVotes}) / (${votes} + ${policy.priorVotes})`;
  if (sort === "rating") return [desc(quality), desc(votes), ...newest];

  const cutoff = new Date(now.getTime() - policy.activityDays * 86400000).toISOString();
  // UNION deduplicates people across all four actions and repeated actions.
  // The author and deleted comments do not increase their own work's heat.
  const participants = sql<number>`(SELECT count(*) FROM (
    SELECT 'user:' || sort_rating.user_id AS actor_id FROM prompt_ratings AS sort_rating
      WHERE sort_rating.prompt_id = ${prompts.id} AND sort_rating.updated_at >= ${cutoff}
    UNION
    SELECT 'user:' || sort_comment.user_id AS actor_id FROM prompt_comments AS sort_comment
      WHERE sort_comment.prompt_id = ${prompts.id} AND sort_comment.created_at >= ${cutoff} AND sort_comment.deleted_at IS NULL
    UNION
    SELECT sort_usage.actor_id FROM prompt_usage AS sort_usage
      WHERE sort_usage.prompt_id = ${prompts.id} AND sort_usage.updated_at >= ${cutoff}
  ) AS sort_participant WHERE sort_participant.actor_id <> 'user:' || ${prompts.ownerId})`;
  const heat = sql<number>`1.0 * ${participants} / (${participants} + ${policy.heatPriorUsers})`;
  const ageDays = sql<number>`max(0, coalesce(julianday(${now.toISOString()}) - julianday(${prompts.createdAt}), 0))`;
  const freshness = sql<number>`1.0 / (1.0 + ${ageDays} / ${policy.freshnessDays})`;
  const combined = sql<number>`100.0 * (
    ${policy.qualityWeight} * ((${quality}) - 1.0) / 4.0
    + ${policy.heatWeight} * (${heat})
    + ${policy.freshnessWeight} * (${freshness})
  )`;
  return [desc(combined), desc(quality), ...newest];
}

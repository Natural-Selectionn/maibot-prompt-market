import { inArray } from "drizzle-orm";
import { env } from "@/db/binding";
import { getDb } from "@/db";
import { userProfiles } from "@/db/schema";

type Actor = { userId: string; author: string };
export const nicknameKey = (name: string) => name.trim().normalize("NFKC").toLocaleLowerCase();
export const accountTag = (number: number) => String(number).padStart(4, "0");

// Lazily register legacy authors too, so older shares get the same stable tag.
async function profilesFor(actors: Actor[]) {
  const unique = [...new Map(actors.map(actor => [actor.userId, actor])).values()];
  if (!unique.length) return [];
  const db = getDb();
  const ids = unique.map(actor => actor.userId);
  let profiles = await db.select().from(userProfiles).where(inArray(userProfiles.userId, ids));
  const known = new Set(profiles.map(profile => profile.userId));
  const missing = unique.filter(actor => !known.has(actor.userId));
  if (missing.length) {
    await db.insert(userProfiles).values(missing.map(actor => {
      const displayName = actor.author.trim().slice(0, 24) || "麦麦用户";
      return { userId: actor.userId, displayName, nameKey: nicknameKey(displayName), updatedAt: new Date().toISOString() };
    })).onConflictDoNothing();
    if (!env.DB) throw new Error("D1 unavailable");
    await env.DB.batch([...new Set(missing.map(actor => nicknameKey(actor.author.trim().slice(0, 24) || "麦麦用户")))].map(key =>
      env.DB!.prepare("UPDATE user_profiles SET disambiguated = 1 WHERE name_key = ? AND (SELECT count(*) FROM user_profiles WHERE name_key = ?) > 1").bind(key, key)));
    profiles = await db.select().from(userProfiles).where(inArray(userProfiles.userId, ids));
  }
  return profiles;
}

export async function getAccountProfile(userId: string, displayName: string) {
  return (await profilesFor([{ userId, author: displayName }]))[0];
}

export async function authorMetadata(actors: Actor[]) {
  const profiles = await profilesFor(actors);
  return new Map(profiles.map(profile => [profile.userId, { author: profile.displayName, authorProfileTag: accountTag(profile.id), authorTag: profile.disambiguated ? accountTag(profile.id) : "" }]));
}

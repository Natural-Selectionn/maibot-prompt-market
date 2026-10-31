import { env } from "@/db/binding";

export async function publicProfile(tag: string) {
  if (!/^\d{1,10}$/.test(tag) || Number(tag)<1) return null;
  const row = await env.DB!.prepare("SELECT id,display_name,disabled,(SELECT count(*) FROM prompts WHERE owner_id=u.user_id) AS works FROM user_profiles u WHERE id=?").bind(Number(tag)).first<{id:number;display_name:string;disabled:number;works:number}>();
  if (!row || row.disabled) return null;
  return { accountTag: String(row.id).padStart(4,"0"), displayName: row.display_name, worksCount: Number(row.works) };
}

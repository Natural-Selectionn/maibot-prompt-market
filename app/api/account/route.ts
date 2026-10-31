import { env } from "@/db/binding";
import { sameOrigin } from "@/lib/community";
import { getSiteUser, publicUser } from "@/lib/site-user";
import { nicknameKey } from "@/lib/account-profiles";

export async function GET() {
  const user = await getSiteUser();
  if (!user) return Response.json({ error: "请先登录。" }, { status: 401 });
  return Response.json({ user: publicUser(user) }, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: Request) {
  const user = await getSiteUser();
  if (!user) return Response.json({ error: "请先登录。" }, { status: 401 });
  if (!sameOrigin(request)) return Response.json({ error: "请求来源无效。" }, { status: 403 });
  let displayName: string;
  try {
    const text = await request.text();
    if (text.length > 1024) throw new Error("too long");
    const payload = JSON.parse(text);
    displayName = typeof payload?.displayName === "string" ? payload.displayName.trim() : "";
    if (!displayName || displayName.length > 24 || /[\u0000-\u001f\u007f]/.test(displayName)) throw new Error("invalid name");
  } catch { return Response.json({ error: "请填写 1–24 字的账号昵称。" }, { status: 400 }); }
  try {
    if (!env.DB) throw new Error("D1 unavailable");
    // Keep every signature tied to this same account in one atomic update.
    await env.DB.batch([
      env.DB.prepare("UPDATE user_profiles SET display_name = ?, name_key = ?, updated_at = ? WHERE user_id = ?").bind(displayName, nicknameKey(displayName), new Date().toISOString(), user.userId),
      env.DB.prepare("UPDATE user_profiles SET disambiguated = 1 WHERE name_key = ? AND (SELECT count(*) FROM user_profiles WHERE name_key = ?) > 1").bind(nicknameKey(displayName), nicknameKey(displayName)),
      env.DB.prepare("UPDATE test_sessions SET display_name = ? WHERE user_id = ?").bind(displayName, user.userId),
      env.DB.prepare("UPDATE prompts SET author = ? WHERE owner_id = ?").bind(displayName, user.userId),
      env.DB.prepare("UPDATE prompt_comments SET author = ? WHERE user_id = ? AND deleted_at IS NULL").bind(displayName, user.userId),
    ]);
    return Response.json({ user: publicUser((await getSiteUser())!) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Failed to update account", error);
    return Response.json({ error: "保存失败，请稍后重试。" }, { status: 503 });
  }
}

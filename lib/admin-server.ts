import { env } from "@/db/binding";
import { getSiteUser } from "@/lib/site-user";
import { sameOrigin } from "@/lib/community";
import { createAdminStore } from "@/lib/admin-store.mjs";

export const adminStore = () => createAdminStore(env.DB!);
export const privateJson = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "no-store" } });

export async function adminAccess(request: Request, write = false) {
  const user = await getSiteUser();
  if (!user) return { response: privateJson({ error: "请先登录。" }, 401) };
  if (user.role !== "admin") return { response: privateJson({ error: "仅管理员可操作。" }, 403) };
  if (write && (!sameOrigin(request) || request.headers.get("sec-fetch-site") === "cross-site")) return { response: privateJson({ error: "请求来源无效。" }, 403) };
  return { user };
}

export async function adminPayload(request: Request, limit = 70000) {
  if (Number(request.headers.get("content-length")) > limit) throw new Error("too_large");
  const text = await request.text();
  if (text.length > limit) throw new Error("too_large");
  try { return JSON.parse(text); } catch { throw new Error("invalid_json"); }
}

export function adminError(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  const messages: Record<string, [number, string]> = {
    forbidden: [403, "管理权限已变化，请刷新页面。"],
    admin_management_forbidden: [403, "仅主管理员 0002 可以设置管理员或管理管理员账号。"],
    primary_admin_protected: [409, "不能取消或封禁主管理员 0002。"],
    not_found: [404, "记录不存在或已删除。"],
    invalid_account: [400, "账号权限或状态格式无效。"],
    last_admin_or_forbidden: [409, "不能移除最后一位有效管理员，或管理权限已变化。"],
    invalid_announcement: [400, "请填写 1–80 字的标题和 1–10000 字的公告正文。"],
    invalid_revision: [400, "请重新载入公告后编辑。"],
    conflict_or_forbidden: [409, "公告或管理权限已变化，请刷新后重试。"],
    invalid_json: [400, "内容格式有误。"], too_large: [413, "内容太长。"],
    invalid_work: [400, error instanceof Error && "detail" in error && typeof error.detail === "string" ? error.detail : "作品内容无效，请检查后重试。"],
    invalid_work_kind: [400, "编辑时不能更改作品类型。"],
    invalid_work_revision: [400, "请重新打开作品后修改。"],
    work_conflict: [409, "作品或管理权限已变化，请重新打开后修改。"],
  };
  const [status, message] = messages[code] ?? [503, "暂时无法完成操作，请稍后重试。"];
  if (status === 503) console.error("Admin operation failed", error);
  return privateJson({ error: message }, status);
}

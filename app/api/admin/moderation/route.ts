import { adminAccess, adminPayload, privateJson } from "@/lib/admin-server";
import { moderationStore, moderationQueue, moderationScheduler } from "@/lib/moderation-server";
import { PRIMARY_ADMIN_ACCOUNT_ID } from "@/lib/admin-policy.mjs";

function failure(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  const messages: Record<string, [number, string]> = {
    moderation_forbidden: [403, "仅主管理员 #0002 可管理 AI 审核。"],
    moderation_conflict: [409, "设置或账号权限已变化，请刷新后重试。"],
    invalid_moderation_settings: [400, "审核设置无效，请检查提示词、等待时间和供应商参数；每家等待不能超过总上限。"],
    invalid_moderation_endpoint: [400, "请填写不含账号、查询参数的公网 HTTPS API 端点。"],
    moderation_key_required: [400, "启用审核需要至少一个已启用且配置密钥的供应商。"],
    moderation_endpoint_key_required: [400, "更改端点时请重新填写此供应商的 API Key。"],
    moderation_encryption_unavailable: [503, "服务器尚未配置密钥加密，请联系服务器管理员。"],
    invalid_json: [400, "内容格式有误。"], too_large: [413, "设置内容太长。"],
  };
  const [status, message] = messages[code] ?? [503, "审核设置暂不可用，请稍后重试。"];
  return privateJson({ error: message }, status);
}

async function access(request: Request, write = false) {
  const auth = await adminAccess(request, write);
  if (auth.response) return auth;
  if (Number(auth.user.accountTag) !== PRIMARY_ADMIN_ACCOUNT_ID) return { response: privateJson({ error: "仅主管理员 #0002 可管理 AI 审核。" }, 403) };
  return auth;
}

export async function GET(request: Request) {
  const auth = await access(request);
  if (auth.response) return auth.response;
  try {
    const store = moderationStore(), settings = await store.settings(auth.user!.userId);
    const query = new URL(request.url).searchParams;
    const page = await store.eventPage(auth.user!.userId, Number(query.get("offset") ?? 0));
    const live = { events: page.items, hasMore: page.hasMore, offset: page.offset, queue: await moderationQueue().stats(), providers: await moderationScheduler().metrics(settings.providers) };
    return privateJson(query.get("live") === "1" ? live : { settings, ...live });
  } catch (error) { return failure(error); }
}

export async function PUT(request: Request) {
  const auth = await access(request, true);
  if (auth.response) return auth.response;
  try { return privateJson({ settings: await moderationStore().save(auth.user!.userId, await adminPayload(request, 150000)) }); }
  catch (error) { return failure(error); }
}

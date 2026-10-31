import { adminAccess, adminError, adminStore, privateJson } from "@/lib/admin-server";
import { readPromptRequestText } from "@/lib/prompt-request";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const access = await adminAccess(request, true);
  if (access.response) return access.response;
  let payload: unknown;
  try {
    const text = await readPromptRequestText(request);
    if (text === null) return privateJson({ error: "请求内容不能超过 2 MiB。" }, 413);
    payload = JSON.parse(text);
  }
  catch { return privateJson({ error: "内容格式有误。" }, 400); }
  try {
    const item = await adminStore().updateWork(access.user.userId, (await context.params).id, payload);
    return privateJson({ item });
  } catch (error) { return adminError(error); }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const access = await adminAccess(request, true);
  if (access.response) return access.response;
  try {
    await adminStore().deleteWork(access.user.userId, (await context.params).id);
    return privateJson({ ok: true });
  } catch (error) { return adminError(error); }
}

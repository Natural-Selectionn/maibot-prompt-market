import { adminAccess, adminError, adminPayload, adminStore, privateJson } from "@/lib/admin-server";

export async function PATCH(request: Request, context: { params: Promise<{ tag: string }> }) {
  const access = await adminAccess(request, true);
  if (access.response) return access.response;
  try {
    await adminStore().updateAccount(access.user.userId, (await context.params).tag, await adminPayload(request));
    return privateJson({ ok: true });
  } catch (error) { return adminError(error); }
}

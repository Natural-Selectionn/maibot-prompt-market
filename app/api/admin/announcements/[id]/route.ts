import { adminAccess, adminError, adminPayload, adminStore, privateJson } from "@/lib/admin-server";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const access = await adminAccess(request, true);
  if (access.response) return access.response;
  try { return privateJson({ item: await adminStore().saveAnnouncement(access.user.userId, await adminPayload(request), (await context.params).id) }); }
  catch (error) { return adminError(error); }
}

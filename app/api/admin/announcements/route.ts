import { adminAccess, adminError, adminPayload, adminStore, privateJson } from "@/lib/admin-server";

export async function GET(request: Request) {
  const access = await adminAccess(request);
  if (access.response) return access.response;
  try { return privateJson(await adminStore().announcements(access.user.userId, Number(new URL(request.url).searchParams.get("offset")))); }
  catch (error) { return adminError(error); }
}

export async function POST(request: Request) {
  const access = await adminAccess(request, true);
  if (access.response) return access.response;
  try { return privateJson({ item: await adminStore().saveAnnouncement(access.user.userId, await adminPayload(request)) }, 201); }
  catch (error) { return adminError(error); }
}

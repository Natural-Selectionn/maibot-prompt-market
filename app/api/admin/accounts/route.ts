import { adminAccess, adminError, adminStore, privateJson } from "@/lib/admin-server";

export async function GET(request: Request) {
  const access = await adminAccess(request);
  if (access.response) return access.response;
  const params = new URL(request.url).searchParams;
  try { return privateJson(await adminStore().accounts(access.user.userId, params.get("q") ?? "", Number(params.get("offset")))); }
  catch (error) { return adminError(error); }
}

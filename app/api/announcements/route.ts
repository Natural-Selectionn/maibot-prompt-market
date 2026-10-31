import { adminError, adminStore, privateJson } from "@/lib/admin-server";

export async function GET(request: Request) {
  try { return privateJson(await adminStore().announcements(null, Number(new URL(request.url).searchParams.get("offset")))); }
  catch (error) { return adminError(error); }
}

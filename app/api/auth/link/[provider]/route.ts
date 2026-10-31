import { formalAuth, isProvider } from "@/lib/auth-contract";
import { authRedirect, startAuthorization } from "@/lib/auth-server";
import { sameOrigin } from "@/lib/community";

export async function POST(request: Request, context: { params: Promise<{ provider: string }> }) {
  const { provider } = await context.params;
  if (!formalAuth() || !isProvider(provider)) return new Response(null, { status: 404 });
  if (!sameOrigin(request)) return Response.json({ error: "请求来源无效。" }, { status: 403 });
  try { return await startAuthorization(request, provider, true); }
  catch { return authRedirect("/account?auth_error=not_ready"); }
}

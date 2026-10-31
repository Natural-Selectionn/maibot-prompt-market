import { formalAuth, isProvider } from "@/lib/auth-contract";
import { authRedirect, startAuthorization } from "@/lib/auth-server";

export async function GET(request: Request, context: { params: Promise<{ provider: string }> }) {
  const { provider } = await context.params;
  if (!formalAuth() || !isProvider(provider)) return new Response(null, { status: 404 });
  try { return await startAuthorization(request, provider, false); }
  catch { return authRedirect("/?auth_error=not_ready"); }
}

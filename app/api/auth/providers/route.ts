import { formalAuth, providers } from "@/lib/auth-contract";
import { providerReady } from "@/lib/oauth-provider";
import { authStore } from "@/lib/auth-server";
import { getSiteUser } from "@/lib/site-user";
import { emailReady } from "@/lib/email-server";
import { env } from "@/db/binding";
import { createPasswordStore } from "@/lib/password-store.mjs";

export async function GET() {
  const formal = formalAuth();
  const user = formal ? await getSiteUser() : null;
  const linked = user ? await authStore().linkedProviders(user.userId) : [];
  const details = user ? await createPasswordStore(env.DB!).details(user.userId) : { address: null, hasPassword: false };
  return Response.json({ formal, password: formal, email: { enabled: emailReady(), linked: linked.includes("email"), ...details }, providers: providers.map(id => ({ id, enabled: formal && providerReady(id), linked: linked.includes(id) })) }, { headers: { "Cache-Control": "no-store" } });
}

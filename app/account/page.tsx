import { getSiteUser, publicUser } from "@/lib/site-user";
import PromptGarden from "../prompt-garden";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const user = await getSiteUser();
  if (!user) redirect("/login?returnTo=%2Faccount");
  return <PromptGarden initialView="account" initialUser={publicUser(user)}/>;
}

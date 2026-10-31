import { getSiteUser, publicUser } from "@/lib/site-user";
import PromptGarden from "./prompt-garden";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getSiteUser();
  return <PromptGarden initialUser={user ? publicUser(user) : null} />;
}

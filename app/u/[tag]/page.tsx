import { notFound, redirect } from "next/navigation";
import { publicProfile } from "@/lib/public-profile";
import { getSiteUser, publicUser } from "@/lib/site-user";
import PromptGarden from "@/app/prompt-garden";

export const dynamic = "force-dynamic";

export default async function ProfilePage({ params }: { params: Promise<{tag:string}> }) {
  const {tag} = await params;
  const profile = await publicProfile(tag);
  if (!profile) notFound();
  if (tag !== profile.accountTag) redirect(`/u/${profile.accountTag}`);
  const user = await getSiteUser();
  return <PromptGarden initialView="profile" initialUser={user ? publicUser(user) : null} profile={profile}/>;
}

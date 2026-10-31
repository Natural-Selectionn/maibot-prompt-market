import { UserRound } from "lucide-react";

export default function AccountEntry({ signedIn }: { signedIn: boolean }) {
  return <a className="key utility-key account-entry" href={signedIn ? "/account" : "/login?returnTo=%2Faccount"} aria-label="账号中心"><UserRound size={16}/><span>账号</span></a>;
}

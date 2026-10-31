import Link from "next/link";
import { getSiteUser } from "@/lib/site-user";
import { PRIMARY_ADMIN_ACCOUNT_ID } from "@/lib/admin-policy.mjs";
import ModerationPanel from "./panel";

export const dynamic = "force-dynamic";

export default async function ModerationPage() {
  const user = await getSiteUser();
  if (user?.role !== "admin" || Number(user.accountTag) !== PRIMARY_ADMIN_ACCOUNT_ID) return <div className="desktop"><div className="app-window"><main className="workspace account-login-screen"><h1>AI 审核</h1><p>仅主管理员 #0002 可管理审核设置。</p><a className="key" href="/account">前往账号中心</a><Link className="key" href="/" prefetch={false}>返回提示词库</Link></main></div></div>;
  return <ModerationPanel/>;
}

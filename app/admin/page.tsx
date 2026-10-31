import Link from "next/link";
import { getSiteUser, publicUser } from "@/lib/site-user";
import AdminPanel from "./panel";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await getSiteUser();
  if (user?.role !== "admin") return <div className="desktop"><div className="app-window"><main className="workspace account-login-screen"><h1>管理面板</h1><p>{user ? "此页面仅限管理员访问。" : "请使用管理员账号登录后访问。"}</p><a className="key hot-key" href="/account">前往账号中心</a><Link className="key" href="/" prefetch={false}>返回提示词库</Link></main></div></div>;
  return <AdminPanel user={publicUser(user)}/>;
}

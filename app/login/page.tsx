import type { Metadata } from "next";
import AuthScreen from "../auth-screen";
export const metadata: Metadata = { title: "登录 · 麦麦提示词库" };
export const dynamic = "force-dynamic";
export default function LoginPage() { return <AuthScreen mode="login"/>; }

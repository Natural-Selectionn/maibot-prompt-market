import type { Metadata } from "next";
import AuthScreen from "../auth-screen";
export const metadata: Metadata = { title: "注册 · 麦麦提示词库" };
export const dynamic = "force-dynamic";
export default function RegisterPage() { return <AuthScreen mode="register"/>; }

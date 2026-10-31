import type { Metadata } from "next";
import AuthScreen from "../auth-screen";
export const metadata: Metadata = { title: "重置密码 · 麦麦提示词库" };
export const dynamic = "force-dynamic";
export default function ForgotPasswordPage() { return <AuthScreen mode="reset"/>; }

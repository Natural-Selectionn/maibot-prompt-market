"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { GitBranch } from "lucide-react";
import { ThemeToggle } from "@/components/theme";
import { Led } from "@/components/retro";
import type { ProviderStatus } from "./test-login";
import EmailAuthForm from "./email-auth-form";
import PasswordLoginForm from "./password-login-form";

export default function AuthScreen({ mode }: { mode: "login" | "register" | "reset" }) {
  const [status, setStatus] = useState<ProviderStatus | null>(null);
  const [returnTo, setReturnTo] = useState("/account");
  const [error, setError] = useState("");
  useEffect(() => {
    const target = new URL(window.location.href).searchParams.get("returnTo");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- The return destination comes from the browser URL after hydration.
    if (target?.startsWith("/") && !target.startsWith("//")) setReturnTo(target);
    const controller = new AbortController();
    fetch("/api/auth/providers", { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error();
      setStatus(await response.json() as ProviderStatus);
    }).catch(cause => { if (cause.name !== "AbortError") setError("登录服务暂不可用。"); });
    return () => controller.abort();
  }, []);
  const query = `?returnTo=${encodeURIComponent(returnTo)}`;
  return <div className="auth-page"><header className="titlebar"><Link className="brand auth-brand" href="/" prefetch={false}><Led/><span className="nameplate">MAI / PROMPT</span></Link><ThemeToggle/></header><main className="auth-page-main"><section className="account-box auth-card"><div className="panel-bar"><strong>{mode === "login" ? "登录" : mode === "register" ? "注册" : "重置密码"}</strong><Link className="auth-text-link" href="/" prefetch={false}>返回首页</Link></div><div className="auth-card-content">
    {mode === "login" ? <PasswordLoginForm returnTo={returnTo}/> : status?.email.enabled ? <EmailAuthForm purpose={mode === "reset" ? "reset" : "register"} returnTo={mode === "reset" ? "/account" : returnTo}/> : <p className="email-auth-note" role="status">{status ? "邮箱服务暂不可用。" : "加载中…"}</p>}
    {mode !== "reset" && status?.providers.some(provider => provider.enabled) && <><div className="auth-divider">或</div><div className="oauth-provider-buttons">{status.providers.filter(provider => provider.enabled).map(provider => <a className="key" key={provider.id} href={`/api/auth/signin/${provider.id}${query}`} target="_top">{provider.id === "github" ? <GitBranch size={16}/> : <span className="provider-google" aria-hidden="true">G</span>}{provider.id === "github" ? "GitHub" : "Google"}</a>)}</div></>}
    {mode === "login" && <p className="auth-switch">没有账号？<a href={`/register${query}`}>注册</a></p>}{mode === "register" && <p className="auth-switch">已有账号？<a href={`/login${query}`}>登录</a></p>}{mode === "reset" && <a className="auth-switch" href={`/login${query}`}>返回登录</a>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </div></section></main></div>;
}

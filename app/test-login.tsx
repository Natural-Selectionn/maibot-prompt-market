"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ArrowRight, GitBranch, UserRound } from "lucide-react";
import { WindowDialog } from "@/components/retro";
import PasswordLoginForm from "./password-login-form";

export type LoginUser = { displayName: string; kind: "test" | "oauth"; accountTag?: string; disambiguated?: boolean; role?: "user" | "admin"; canManageAdmins?: boolean };
export type ProviderStatus = { formal: boolean; password?: boolean; email: { enabled: boolean; linked: boolean; address?: string | null; hasPassword?: boolean }; providers: { id: "github" | "google"; enabled: boolean; linked: boolean }[] };

export default function TestLogin({ onClose, onLogin, returnTo = "/account" }: { onClose: () => void; onLogin: (user: LoginUser) => void; returnTo?: string }) {
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<ProviderStatus | null>(null);
  useEffect(() => {
    fetch("/api/auth/providers").then(async response => {
      if (!response.ok) throw new Error("登录服务暂不可用，请稍后重试。");
      setStatus(await response.json() as ProviderStatus);
    }).catch(() => setError("登录服务暂不可用，请稍后重试。"));
  }, []);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch("/api/test-session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ displayName }) });
      const data = await response.json() as { user?: LoginUser; error?: string };
      if (!response.ok || !data.user) throw new Error(data.error || "登录失败。");
      onLogin(data.user);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "登录失败。"); }
    finally { setBusy(false); }
  };
  if (!status || status.formal) return <WindowDialog title="登录" subtitle="ACCOUNT / LOGIN" onClose={onClose}>
    <div className="editor oauth-login"><PasswordLoginForm returnTo={returnTo}/><div className="oauth-provider-buttons">{status?.providers.filter(provider => provider.enabled).map(provider => <a className="key" key={provider.id} href={`/api/auth/signin/${provider.id}?returnTo=${encodeURIComponent(returnTo)}`} target="_top">{provider.id === "github" ? <GitBranch size={17}/> : <span className="provider-google" aria-hidden="true">G</span>}{provider.id === "github" ? "GitHub" : "Google"}</a>)}</div><a className="auth-switch" href={`/register?returnTo=${encodeURIComponent(returnTo)}`}>注册账号</a>{error && <p className="form-error" role="alert">{error}</p>}</div>
  </WindowDialog>;
  return <WindowDialog title="测试登录" subtitle="ACCOUNT / LOGIN" onClose={onClose}>
    <form className="editor test-login" onSubmit={submit}><span className="login-icon"><UserRound size={24}/></span><label>账号昵称<input value={displayName} onChange={event => setDisplayName(event.target.value)} maxLength={24} placeholder="输入测试昵称" autoComplete="nickname" autoFocus required/></label>{error && <p className="form-error" role="alert">{error}</p>}<div className="dialog-actions"><button type="button" className="key" onClick={onClose}>取消</button><button className="key hot-key" disabled={busy}>{busy ? "登录中…" : "登录"}<ArrowRight size={15}/></button></div></form>
  </WindowDialog>;
}

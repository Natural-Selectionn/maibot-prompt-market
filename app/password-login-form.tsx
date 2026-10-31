"use client";

import { useState, type FormEvent } from "react";

export default function PasswordLoginForm({ returnTo = "/account" }: { returnTo?: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/password/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, returnTo }) });
      const data = await response.json() as { ok?: boolean; error?: string; returnTo?: string };
      if (!response.ok || !data.ok || !data.returnTo) throw new Error(data.error || "登录失败，请重试。");
      window.location.assign(data.returnTo);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "登录失败，请重试。"); setBusy(false); }
  }
  return <form className="editor email-auth-form" onSubmit={submit}>
    <label>邮箱<input type="email" autoComplete="username" value={email} onChange={event => setEmail(event.target.value)} maxLength={254} required disabled={busy}/></label>
    <label>密码<input type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} maxLength={128} required disabled={busy}/></label>
    <a className="auth-forgot" href="/forgot-password">忘记密码？</a>
    {error && <p className="form-error" role="alert">{error}</p>}
    <button className="key hot-key" disabled={busy}>{busy ? "登录中…" : "登录"}</button>
  </form>;
}

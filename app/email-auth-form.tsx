"use client";

import { useEffect, useState, type FormEvent } from "react";

export default function EmailAuthForm({ purpose, address = "", returnTo = "/account" }: { purpose: "register" | "reset" | "link" | "set-password"; address?: string; returnTo?: string }) {
  const [email, setEmail] = useState(address);
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [code, setCode] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const needsPassword = purpose !== "link";
  const label = purpose === "register" ? "注册" : purpose === "link" ? "绑定邮箱" : "保存密码";
  useEffect(() => {
    if (!cooldown) return;
    const timer = window.setTimeout(() => setCooldown(value => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);
  async function send() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/email/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, displayName, purpose, returnTo }) });
      const data = await response.json() as { error?: string; challengeId?: string; retryAfter?: number };
      if (!response.ok || !data.challengeId) throw new Error(data.error || "发送失败，请重试。");
      setChallengeId(data.challengeId); setCode(""); setCooldown(data.retryAfter ?? 120);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "发送失败，请重试。"); }
    finally { setBusy(false); }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!challengeId) { await send(); return; }
    if (needsPassword && password !== confirmation) { setError("两次密码不一致。"); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/email/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ challengeId, code, ...(needsPassword ? { password } : {}) }) });
      const data = await response.json() as { error?: string; ok?: boolean; returnTo?: string };
      if (!response.ok || !data.ok || !data.returnTo) throw new Error(data.error || "验证失败，请重试。");
      window.location.assign(data.returnTo);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "验证失败，请重试。"); setBusy(false); }
  }
  return <form className="editor email-auth-form" onSubmit={submit}>
    <label>邮箱<input type="email" value={email} onChange={event => setEmail(event.target.value)} readOnly={!!challengeId || !!address} maxLength={254} autoComplete="email" required disabled={busy}/></label>
    {purpose === "register" && !challengeId && <label>昵称<input value={displayName} onChange={event => setDisplayName(event.target.value)} maxLength={24} autoComplete="nickname" disabled={busy} required/></label>}
    {challengeId && <><p className="email-auth-note" role="status">验证码已发送，15 分钟内有效。</p><label>验证码<input value={code} onChange={event => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required disabled={busy}/></label>{needsPassword && <><label>{purpose === "register" ? "密码" : "新密码"}<input type="password" value={password} onChange={event => setPassword(event.target.value)} minLength={6} maxLength={128} autoComplete="new-password" placeholder="6–128 个字符" required disabled={busy}/></label><label>确认密码<input type="password" value={confirmation} onChange={event => setConfirmation(event.target.value)} minLength={6} maxLength={128} autoComplete="new-password" required disabled={busy}/></label></>}</>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <button className="key hot-key" disabled={busy || (!challengeId && cooldown > 0)}>{busy ? "处理中…" : challengeId ? label : cooldown > 0 ? `${cooldown} 秒后可发送` : "获取验证码"}</button>
    {challengeId && <div className="email-auth-actions"><button className="key small-key" type="button" onClick={() => void send()} disabled={busy || cooldown > 0}>{cooldown > 0 ? `${cooldown} 秒后重发` : "重新发送"}</button>{!address && <button className="key small-key" type="button" onClick={() => { setChallengeId(""); setCode(""); setPassword(""); setConfirmation(""); setError(""); }} disabled={busy}>更换邮箱</button>}</div>}
  </form>;
}

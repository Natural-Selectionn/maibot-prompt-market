import { authOrigin, formalAuth } from "./auth-contract";
import { requestOrigin } from "./request-origin";
import { EMAIL_AGE, EMAIL_RETRY_AFTER, EmailAuthError } from "./email-core";

export const emailReady = () => formalAuth() && !!process.env.RESEND_API_KEY &&
  !!process.env.RESEND_FROM && (process.env.EMAIL_AUTH_SECRET?.length ?? 0) >= 32;

export function emailRequestAllowed(request: Request) {
  return request.headers.get("origin") === authOrigin() && requestOrigin(request) === authOrigin();
}
export async function emailPayload(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json") || Number(request.headers.get("content-length")) > 2048) throw new EmailAuthError("invalid_request");
  const text = await request.text();
  if (text.length > 2048) throw new EmailAuthError("invalid_request");
  try {
    const value = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value;
  } catch { throw new EmailAuthError("invalid_request"); }
}
export async function sendVerificationEmail(email: string, code: string, id: string) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST", signal: AbortSignal.timeout(15000),
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": `email-code/${id}` },
    body: JSON.stringify({
      from: process.env.RESEND_FROM, to: [email], subject: "麦麦灵感集 · 邮箱验证码",
      text: `你的邮箱验证码是：${code}\n\n${EMAIL_AGE / 60} 分钟内有效，仅可使用一次。请在发起请求的浏览器中输入。\n如果不是你本人操作，请忽略此邮件。\n\n麦麦灵感集 · ${authOrigin()}`,
      html: `<div style="font-family:Arial,sans-serif;line-height:1.8;color:#2f2c28"><h2>麦麦灵感集</h2><p>你的邮箱验证码是：</p><p style="font-size:32px;font-weight:bold;letter-spacing:8px">${code}</p><p>${EMAIL_AGE / 60} 分钟内有效，仅可使用一次。请在发起请求的浏览器中输入。</p><p>如果不是你本人操作，请忽略此邮件。</p></div>`,
    }),
  });
  // Never forward provider bodies, credentials or verification codes to logs.
  if (!response.ok) throw new Error("resend_rejected");
}
export function emailFailure(error: unknown) {
  const reason = error instanceof EmailAuthError ? error.reason : "unavailable";
  const status = error instanceof EmailAuthError ? error.status : 503;
  const messages: Record<string, string> = {
    invalid_email: "请填写有效的邮箱地址。", invalid_request: "请求格式无效。",
    invalid_password: "密码须为 6–128 个字符。",
    invalid_code: "验证码无效、已过期或尝试次数过多，请重新获取。",
    link_expired: "登录状态已改变，请刷新页面后重新绑定。",
    identity_conflict: "邮箱状态已变化，请登录或重新验证。",
    rate_limited: "验证码发送过于频繁，请稍后再试。",
    send_failed: "邮件暂时发送失败，请稍后重试。", not_ready: "邮箱登录暂未开放。",
  };
  return Response.json({ error: messages[reason] ?? "邮箱服务暂不可用，请稍后重试。" }, {
    status, headers: { "Cache-Control": "no-store", ...(status === 429 ? { "Retry-After": String(EMAIL_RETRY_AFTER) } : {}) },
  });
}

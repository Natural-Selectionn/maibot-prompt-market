export const MAIBOT_ORIGIN_KEY = "maibot-webui-origin";
export const MAIBOT_SESSION_KEY = "maibot-webui-entry-v1";
export const MAIBOT_ADDRESS_ERROR = "请填写有效的 WebUI 地址（http:// 或 https://，包含端口，不含路径、参数或登录信息）。";
export type MaibotEntrySession = { source: "webui"; origin: string | null };

/** Remember an explicit WebUI visit, not merely a previously entered address. */
export function readMaibotSession(text: string | null): MaibotEntrySession | null {
  try {
    const value = JSON.parse(text ?? "null");
    if (!value || value.source !== "webui" || !(value.origin === null || typeof value.origin === "string")) return null;
    return { source: "webui", origin: value.origin === null ? null : normalizeMaibotOrigin(value.origin) };
  } catch { return null; }
}

/** Accept an origin only; return links always use MaiBot's fixed import route. */
export function normalizeMaibotOrigin(value: string): string {
  const text = value.trim();
  if (!/^https?:\/\//i.test(text) || text.length > 4096 || /[\u0000-\u0020\u007f\\]/.test(text)) throw new Error(MAIBOT_ADDRESS_ERROR);
  let url: URL;
  try { url = new URL(text); } catch { throw new Error(MAIBOT_ADDRESS_ERROR); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error(MAIBOT_ADDRESS_ERROR);
  }
  return url.origin;
}

/** A new, invalid source clears a previous target rather than reusing it. */
export function readMaibotEntry(hash: string): { origin: string | null; theme?: "light" | "dark"; remainingHash: string } | null {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  if (!params.has(MAIBOT_ORIGIN_KEY)) return null;
  let origin: string | null = null;
  try {
    if (params.getAll(MAIBOT_ORIGIN_KEY).length === 1) origin = normalizeMaibotOrigin(params.get(MAIBOT_ORIGIN_KEY)!);
  } catch { /* Unsupported sources can be corrected in the target editor. */ }
  const theme = params.get("theme");
  params.delete(MAIBOT_ORIGIN_KEY);
  params.delete("theme");
  params.delete("appearance");
  const rest = params.toString();
  return { origin, theme: theme === "light" || theme === "dark" ? theme : undefined, remainingHash: rest ? `#${rest}` : "" };
}

export function maibotConfigUrl(origin: string): URL {
  return new URL("/config/bot?tab=bot", normalizeMaibotOrigin(origin));
}

export function maibotImportUrl(origin: string, json: string): string {
  const url = maibotConfigUrl(origin);
  url.hash = new URLSearchParams({ "personality-import": json }).toString();
  return url.href;
}

import type { CommunityStats } from "./prompts";

let ready: Promise<boolean> | undefined;
let pending: Promise<unknown> = Promise.resolve();

export function prepareUsage(reset = false): Promise<boolean> {
  if (reset) ready = undefined;
  const initialize = () => fetch("/api/usage/visitor", { method: "POST", credentials: "same-origin" })
    .then(response => response.ok).catch(() => false);
  // Tabs sharing a browser also share its HttpOnly cookie. Serialize initial
  // issuance where Web Locks are available so simultaneous first clicks agree.
  ready ??= typeof navigator !== "undefined" && navigator.locks
    ? navigator.locks.request("mai-usage-visitor", initialize).then(async result => await result).catch(() => false)
    : initialize();
  return ready;
}

/** Keep first-use cookie issuance and count responses ordered within a tab. */
export function recordUsage(id: string, action: "copy" | "download"): Promise<CommunityStats | null> {
  const result = pending.then(async () => {
    if (!(await prepareUsage())) { ready = undefined; return null; }
    const send = () => fetch(`/api/prompts/${encodeURIComponent(id)}/usage`, {
      method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }),
    });
    let response = await send();
    if (response.status === 428 && await prepareUsage(true)) response = await send();
    if (!response.ok) return null;
    const body = await response.json() as { stats: CommunityStats };
    return body.stats;
  }).catch(() => null);
  pending = result;
  return result;
}

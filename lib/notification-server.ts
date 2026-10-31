import { env } from "@/db/binding";
import { samples, promptTitle } from "@/lib/prompts";
import { createNotificationStore } from "./notification-store.mjs";

export function notificationStore() {
  if (!env.DB) throw new Error("Database unavailable");
  return createNotificationStore(env.DB, Object.fromEntries(samples.map(item => [item.id, promptTitle(item)])));
}

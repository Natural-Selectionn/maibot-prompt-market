export type NotificationItem = {
  id: number; type: "comment" | "reply" | "rating"; promptId: string; commentId: string | null;
  title: string; createdAt: string; readAt: string | null; body?: string; actor?: string; actorTag?: string;
};
export type NotificationPage = { items: NotificationItem[]; unreadCount: number; snapshot: number; hasMore: boolean; next: number | null };

export async function markNotificationRead(id: number) {
  const response = await fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({id}) });
  if (!response.ok) throw new Error("标记已读失败。");
  const data = await response.json() as {unreadCount:number};
  window.dispatchEvent(new CustomEvent("mai-notifications-read",{detail:data}));
}

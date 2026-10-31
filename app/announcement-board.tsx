"use client";

import { useEffect, useState } from "react";
import { Megaphone, RefreshCw } from "lucide-react";

export type Announcement = { id: string; title: string; body: string; published: boolean; createdAt: string; updatedAt: string };
export const announcementDate = (date: string) => new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Singapore", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(date));

export default function AnnouncementBoard() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/announcements", { signal: controller.signal, cache: "no-store" }).then(async response => {
      if (!response.ok) throw new Error("公告暂时加载失败。");
      const data = await response.json() as { items: Announcement[]; hasMore: boolean };
      if (!controller.signal.aborted) { setItems(data.items); setHasMore(data.hasMore); }
    }).catch(cause => { if (cause.name !== "AbortError") setError(cause.message); })
      .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [revision]);
  const refresh = () => { setBusy(true); setError(""); setRevision(value => value + 1); };
  const more = async () => {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/announcements?offset=${items.length}`, { cache: "no-store" });
      if (!response.ok) throw new Error("公告暂时加载失败。");
      const data = await response.json() as { items: Announcement[]; hasMore: boolean }; setItems(previous => [...previous, ...data.items]); setHasMore(data.hasMore);
    } catch { setError("公告暂时加载失败。"); } finally { setBusy(false); }
  };
  return <section className="announcement-board" aria-label="公告栏">
    <div className="announcement-bar"><strong><Megaphone size={16}/>公告栏</strong><button className="key icon-key" aria-label="刷新公告" disabled={busy} onClick={refresh}><RefreshCw size={13}/></button></div>
    {error ? <p className="form-error" role="alert">{error}</p> : !items.length && <p className="announcement-empty">{busy ? "正在读取公告…" : "暂无公告"}</p>}
    {items.map((item, index) => <details key={item.id} className="announcement-item" open={index === 0 ? true : undefined}><summary><span>{item.title}</span><time dateTime={item.createdAt}>{announcementDate(item.createdAt)}</time></summary><p>{item.body}</p></details>)}
    {hasMore && <div className="more-row"><button className="key" disabled={busy} onClick={more}>{busy ? "读取中…" : "更多公告"}</button></div>}
  </section>;
}

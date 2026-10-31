"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, CheckCheck, RefreshCw } from "lucide-react";
import { WindowDialog } from "@/components/retro";
import type { NotificationItem, NotificationPage } from "@/lib/notification-client";

export default function NotificationCenter() {
  const [count,setCount] = useState<number|null>(null);
  const [open,setOpen] = useState(false);
  const [page,setPage] = useState<NotificationPage|null>(null);
  const [error,setError] = useState("");
  const [busy,setBusy] = useState(false);
  const [badgeError,setBadgeError] = useState(false);
  const listRequest = useRef<AbortController|null>(null);
  useEffect(() => {
    const controller = new AbortController();
    let running = false, failures = 0, version=0, timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      if (running || controller.signal.aborted || document.visibilityState === "hidden") return;
      running=true;
      const requestVersion=version;
      try {
        const response = await fetch("/api/notifications?count=1",{cache:"no-store",signal:AbortSignal.any([controller.signal,AbortSignal.timeout(10000)])});
        if (controller.signal.aborted) return;
        if (response.status===401) { listRequest.current?.abort(); setCount(null); setPage(null); setOpen(false); setBadgeError(true); return; }
        const data = await response.json() as {unreadCount:number};
        if (!response.ok) throw new Error();
        if (!controller.signal.aborted && requestVersion===version) { setCount(data.unreadCount); setBadgeError(false); failures=0; }
      } catch { if (!controller.signal.aborted) { setBadgeError(true); failures++; } }
      finally {
        running=false; clearTimeout(timer);
        if (!controller.signal.aborted) timer=setTimeout(() => { void load(); },Math.min(240000,30000*2**Math.min(failures,3)));
      }
    };
    const visible = () => { if (document.visibilityState !== "hidden") void load(); };
    const read = (event: Event) => {
      if (event instanceof CustomEvent && typeof event.detail?.unreadCount === "number") { version++; setCount(event.detail.unreadCount); setBadgeError(false); }
      else visible();
    };
    void load();
    window.addEventListener("mai-notifications-read",read);
    window.addEventListener("focus",visible);
    document.addEventListener("visibilitychange",visible);
    return () => { controller.abort(); clearTimeout(timer); window.removeEventListener("mai-notifications-read",read); window.removeEventListener("focus",visible); document.removeEventListener("visibilitychange",visible); };
  },[]);
  const loadList = useCallback(async (before?: number) => {
    listRequest.current?.abort();
    const controller = new AbortController(); listRequest.current=controller;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/notifications${before ? `?before=${before}` : ""}`,{cache:"no-store",signal:controller.signal});
      const data = await response.json() as NotificationPage & {error?:string};
      if (!response.ok) throw new Error(data.error || "消息暂时加载失败。");
      if (!controller.signal.aborted) {
        setPage(previous => before && previous ? {...data,snapshot:previous.snapshot,items:[...previous.items,...data.items.filter(item=>!previous.items.some(old=>old.id===item.id))]} : data);
        setCount(data.unreadCount); setBadgeError(false);
      }
    } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "消息加载失败。"); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  },[]);
  useEffect(() => () => listRequest.current?.abort(), []);
  const close = () => { listRequest.current?.abort(); setOpen(false); };
  const show = () => { setOpen(true); void loadList(); };
  const readAll = async () => {
    if (!page) return;
    setBusy(true); setError("");
    try {
      const response=await fetch("/api/notifications",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({through:page.snapshot})});
      const result=await response.json() as {unreadCount:number;error?:string};
      if (!response.ok) throw new Error(result.error || "标记已读失败。");
      setCount(result.unreadCount);
      setPage(previous=>previous ? {...previous,items:previous.items.map(item=>item.id<=page.snapshot ? {...item,readAt:item.readAt || new Date().toISOString()} : item)} : previous);
      window.dispatchEvent(new CustomEvent("mai-notifications-read",{detail:result}));
    } catch(cause) { setError(cause instanceof Error ? cause.message : "标记已读失败。"); }
    finally { setBusy(false); }
  };
  const href = (item:NotificationItem) => `/?${new URLSearchParams({prompt:item.promptId,notification:String(item.id),...(item.commentId ? {comment:item.commentId} : {})})}`;
  return <>
    <button type="button" className="key utility-key notification-entry" onClick={show} aria-label={`消息${count ? `，${count} 条未读` : ""}${badgeError ? "，状态待刷新" : ""}`} title={badgeError ? "消息状态暂不可用，点击重试" : "消息"}>
      <Bell size={14}/><span>消息</span>{!!count && <i className="notification-dot" aria-hidden="true"/>}
    </button>
    {open && <WindowDialog title="消息中心" subtitle="MESSAGES" onClose={close}>
      <div className="notification-toolbar"><span>{count===null ? "读取消息" : `${count} 条未读`}</span><div><button className="key small-key" disabled={busy} onClick={()=>void loadList()} aria-label="刷新消息"><RefreshCw size={14}/></button><button className="key small-key" disabled={busy || !page || !count} onClick={()=>void readAll()}><CheckCheck size={14}/>全部已读</button></div></div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {busy && !page && <p role="status">正在加载消息…</p>}
      {!busy && page?.items.length===0 && <div className="empty-screen"><Bell size={24}/><strong>暂无消息</strong><span>作品收到评论、评分或评论被回复时，会在这里提醒你。</span></div>}
      <div className="notification-list">{page?.items.map(item=><a key={item.id} className={`notification-item ${item.readAt ? "" : "is-unread"}`} href={href(item)}>
        <div className="notification-heading"><strong>{item.type==="rating" ? "你的作品收到了新评分" : `${item.actor}${item.type==="reply" ? "回复了你的评论" : "评论了你的作品"}`}</strong><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString("zh-CN")}</time></div>
        <span className="notification-title">{item.title}</span>{item.body && <p>{item.body}</p>}{!item.readAt && <span className="notification-unread-label">未读</span>}
      </a>)}</div>
      {page?.hasMore && <div className="more-row"><button className="key" disabled={busy} onClick={()=>void loadList(page.next!)}>{busy ? "加载中…" : "加载更多消息"}</button></div>}
    </WindowDialog>}
  </>;
}

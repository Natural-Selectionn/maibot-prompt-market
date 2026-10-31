"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, Megaphone, Plus, RefreshCw, Search, ShieldCheck, Users, FileText } from "lucide-react";
import { ThemeToggle } from "@/components/theme";
import { Led, WindowDialog } from "@/components/retro";
import { announcementDate, type Announcement } from "../announcement-board";
import type { LoginUser } from "../test-login";
import PromptComposer from "../prompt-composer";
import type { PromptItem } from "@/lib/prompts";

type Tab = "accounts" | "works" | "announcements";
type Account = { accountTag: string; displayName: string; role: "user" | "admin"; disabled: boolean; worksCount: number; providers: string[] };
type Work = { id: string; title: string; kind: string; author: string; accountTag: string; createdAt: string };
type Confirmation = { title: string; description: string; path: string; method: string; payload?: unknown };
const tabs = [{ id: "accounts" as const, label: "账号管理", Icon: Users }, { id: "works" as const, label: "作品管理", Icon: FileText }, { id: "announcements" as const, label: "公告管理", Icon: Megaphone }];

async function api(path: string, method = "GET", payload?: unknown) {
  const response = await fetch(path, { method, cache: "no-store", headers: payload ? { "Content-Type": "application/json" } : undefined, body: payload ? JSON.stringify(payload) : undefined });
  const data = await response.json() as { error?: string };
  if (!response.ok) throw new Error(data.error ?? "操作失败，请重试。");
  return data;
}

export default function AdminPanel({ user }: { user: LoginUser }) {
  const [tab, setTab] = useState<Tab>("accounts");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [works, setWorks] = useState<Work[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);
  const [confirm, setConfirm] = useState<Confirmation | null>(null);
  const [editing, setEditing] = useState<Announcement | "new" | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [published, setPublished] = useState(true);
  const [editorError, setEditorError] = useState("");
  const [editingWork, setEditingWork] = useState<PromptItem | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/admin/${tab}?q=${encodeURIComponent(search)}&offset=${offset}`, { signal: controller.signal, cache: "no-store" }).then(async response => {
      const data = await response.json() as { error?: string; items: unknown[]; hasMore: boolean };
      if (!response.ok) throw new Error(data.error || "列表加载失败。");
      if (controller.signal.aborted) return;
      setHasMore(data.hasMore);
      if (tab === "accounts") setAccounts(data.items as Account[]);
      if (tab === "works") setWorks(data.items as Work[]);
      if (tab === "announcements") setAnnouncements(data.items as Announcement[]);
    }).catch(cause => { if (cause.name !== "AbortError") setError(cause.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [tab, search, offset, revision]);
  const beginLoad = () => { setLoading(true); setError(""); };
  const reload = useCallback(() => { setLoading(true); setError(""); setRevision(value => value + 1); }, []);
  const changePage = (next: number) => { if (next !== offset) { beginLoad(); setOffset(next); } };
  const workPublished = useCallback(() => { setEditingWork(null); setNotice("作品修改已保存。"); reload(); }, [reload]);
  const switchTab = (next: Tab) => { reload(); setTab(next); setOffset(0); setSearch(""); setQuery(""); setNotice(""); };
  const openEditor = (item: Announcement | "new") => { setEditing(item); setTitle(item === "new" ? "" : item.title); setBody(item === "new" ? "" : item.body); setPublished(item === "new" ? true : item.published); setEditorError(""); };
  const openWorkEditor = async (item: Work) => {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/prompts/${encodeURIComponent(item.id)}`, { cache: "no-store" });
      const data = await response.json() as { error?: string; item?: PromptItem };
      if (!response.ok || !data.item) throw new Error(data.error || "作品加载失败。");
      setEditingWork(data.item);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "作品加载失败。"); }
    finally { setBusy(false); }
  };
  const run = async () => {
    if (!confirm) return;
    setBusy(true); setError("");
    try { await api(confirm.path, confirm.method, confirm.payload); setConfirm(null); setNotice("操作已完成"); reload(); }
    catch (cause) { setConfirm(null); setError(cause instanceof Error ? cause.message : "操作失败。"); }
    finally { setBusy(false); }
  };
  const save = async (event: FormEvent) => {
    event.preventDefault(); if (!editing) return;
    setBusy(true); setEditorError("");
    try {
      await api(`/api/admin/announcements${editing === "new" ? "" : `/${editing.id}`}`, editing === "new" ? "POST" : "PATCH", { title, body, published, ...(editing === "new" ? {} : { revision: editing.updatedAt }) });
      setEditing(null); setNotice(published ? "公告已发布" : "公告已存为草稿"); setOffset(0); reload();
    } catch (cause) { setEditorError(cause instanceof Error ? cause.message : "保存失败。"); } finally { setBusy(false); }
  };
  const empty = tab === "accounts" ? accounts.length === 0 : tab === "works" ? works.length === 0 : announcements.length === 0;
  return <div className="desktop"><div className="app-window admin-window">
    <header className="titlebar"><div className="brand"><Led/><span className="nameplate">MAI / ADMIN</span><span className="brand-cn">管理面板</span></div><div className="title-actions"><ThemeToggle/><Link className="key" href="/" prefetch={false}><ArrowLeft size={14}/><span>返回网站</span></Link></div></header>
    <nav className="folder-tabs" aria-label="管理分类">{tabs.map(({ id, label, Icon }) => <button key={id} className={`folder-tab ${tab === id ? "selected" : ""}`} onClick={() => switchTab(id)} aria-pressed={tab === id}><Icon size={15}/>{label}</button>)}{user.canManageAdmins && <a className="folder-tab" href="/admin/moderation"><ShieldCheck size={15}/>AI 审核</a>}</nav>
    <main className="workspace admin-workspace"><div className="workspace-heading"><div><div className="kicker">ADMINISTRATION</div><h1>{tabs.find(item => item.id === tab)?.label}</h1></div><span className="admin-badge"><ShieldCheck size={16}/>{user.displayName} · #{user.accountTag}</span></div>
      <div className="control-panel">{tab === "announcements" ? <><p className="admin-help">发布站点动态，或将公告存为草稿。</p><button className="key hot-key" onClick={() => openEditor("new")}><Plus size={15}/>新建公告</button></> : <form className="admin-search" onSubmit={event => { event.preventDefault(); setOffset(0); setSearch(query); reload(); }}><label className="search-screen"><Search size={16}/><span className="sr-only">搜索{tab === "accounts" ? "昵称或账号编号" : "作品、作者或账号编号"}</span><input value={query} maxLength={80} onChange={event => setQuery(event.target.value)} placeholder={tab === "accounts" ? "搜索昵称或账号编号" : "搜索作品、作者或账号编号"}/></label><button className="key">搜索</button></form>}<button className="key icon-key" onClick={reload} disabled={loading} aria-label="刷新管理列表"><RefreshCw size={15}/></button></div>
      {tab === "accounts" && !user.canManageAdmins && <p className="admin-help">管理员授权及管理员账号操作由主管理员 #0002 管理。</p>}
      {notice && <p className="admin-notice" role="status">{notice}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <section className="library-panel admin-list" aria-label={tabs.find(item => item.id === tab)?.label} aria-busy={loading}>
        {loading ? <div className="empty-screen" role="status">正在读取…</div> : error ? <div className="empty-screen"><button className="key" onClick={reload}>重试</button></div> : empty ? <div className="empty-screen">{search ? "没有匹配的记录" : tab === "works" ? "暂无已发布作品" : tab === "announcements" ? "暂无公告，点击「新建公告」开始。" : "暂无账号"}</div> : tab === "accounts" ? <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>账号</th><th>权限 / 状态</th><th>登录方式</th><th>作品</th><th>操作</th></tr></thead><tbody>{accounts.map(item => <tr key={item.accountTag}><td><strong>{item.displayName}</strong><small>#{item.accountTag}{item.accountTag === user.accountTag ? " · 当前账号" : ""}</small></td><td><span className={`admin-state ${item.disabled ? "state-disabled" : ""}`}>{item.role === "admin" ? item.accountTag === "0002" ? "主管理员" : "管理员" : "普通用户"} · {item.disabled ? "已封禁" : "正常"}</span></td><td>{item.providers.map(provider => ({ github: "GitHub", google: "Google", email: "邮箱" })[provider] ?? provider).join(" / ") || "历史账号"}</td><td>{item.worksCount}</td><td><div className="admin-actions"><button className="key" disabled={busy || item.accountTag === user.accountTag || (!user.canManageAdmins && (item.role === "admin" || item.accountTag === "0002"))} onClick={() => setConfirm({ title: item.disabled ? "恢复账号" : "封禁账号", description: `${item.disabled ? "恢复后此账号可重新登录。" : "此账号将立即退出，恢复前无法登录。已发布作品保留。"}\n${item.displayName} #${item.accountTag}`, path: `/api/admin/accounts/${item.accountTag}`, method: "PATCH", payload: { disabled: !item.disabled } })}>{item.disabled ? "恢复账号" : "封禁账号"}</button>{user.canManageAdmins && <button className="key" disabled={busy || item.accountTag === user.accountTag} onClick={() => setConfirm({ title: item.role === "admin" ? "取消管理员" : "设为管理员", description: `${item.displayName} #${item.accountTag}\n${item.role === "admin" ? "此账号将失去管理面板访问权限。" : "此账号将可管理普通账号、编辑或删除作品和发布公告，无权设置管理员。"}`, path: `/api/admin/accounts/${item.accountTag}`, method: "PATCH", payload: { role: item.role === "admin" ? "user" : "admin" } })}>{item.role === "admin" ? "取消管理员" : "设为管理员"}</button>}</div></td></tr>)}</tbody></table></div> : tab === "works" ? <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>作品</th><th>作者</th><th>发布时间</th><th>操作</th></tr></thead><tbody>{works.map(item => <tr key={item.id}><td><strong>{item.title || "未命名作品"}</strong><small>{item.kind === "template" ? "Prompt 模板" : "人格与聊天配置"}</small></td><td>{item.author}<small>#{item.accountTag}</small></td><td>{announcementDate(item.createdAt)}</td><td><div className="admin-actions"><a className="key" href={`/?prompt=${encodeURIComponent(item.id)}`} target="_blank" rel="noreferrer">查看全文</a><button className="key" disabled={busy} onClick={() => void openWorkEditor(item)}>编辑作品</button><button className="key admin-danger" disabled={busy} onClick={() => setConfirm({ title: "删除作品", description: `「${item.title || "未命名作品"}」及其评论、评分将永久删除。`, path: `/api/admin/works/${item.id}`, method: "DELETE" })}>删除作品</button></div></td></tr>)}</tbody></table></div> : <div className="admin-announcements">{announcements.map(item => <article key={item.id}><div className="admin-announcement-heading"><h2>{item.title}</h2><span className="admin-state">{item.published ? "已发布" : "草稿"}</span></div><time dateTime={item.createdAt}>{announcementDate(item.createdAt)}</time><p>{item.body}</p><div className="admin-actions"><button className="key" onClick={() => openEditor(item)}>编辑</button><button className="key" disabled={busy} onClick={() => setConfirm({ title: item.published ? "撤下公告" : "发布公告", description: item.published ? "撤下后首页不再显示，仍可在后台编辑并重新发布。" : "发布后所有访客均可查看此公告。", path: `/api/admin/announcements/${item.id}`, method: "PATCH", payload: { title: item.title, body: item.body, published: !item.published, revision: item.updatedAt } })}>{item.published ? "撤下公告" : "发布公告"}</button></div></article>)}</div>}
      </section>
      <div className="admin-pagination"><button className="key" disabled={loading || offset === 0} onClick={() => changePage(Math.max(0, offset - 20))}>上一页</button><span>第 {offset / 20 + 1} 页</span><button className="key" disabled={loading || !hasMore} onClick={() => changePage(offset + 20)}>下一页</button></div>
      <div className="statusbar"><span><Led/>管理员模式</span><span>MAIBOT COMMUNITY</span><a href="/account">账号中心</a></div>
    </main></div>
    {editingWork && <PromptComposer key={editingWork.id} initialKind={editingWork.kind} initialItem={editingWork} adminEdit onClose={() => setEditingWork(null)} onPublished={workPublished}/>}
    {confirm && <WindowDialog title={confirm.title} subtitle="CONFIRM" onClose={() => { if (!busy) setConfirm(null); }}><div className="editor"><p className="admin-confirm-text">{confirm.description}</p><div className="dialog-actions"><button className="key" disabled={busy} onClick={() => setConfirm(null)}>取消</button><button className="key hot-key" disabled={busy} onClick={run}>{busy ? "处理中…" : "确认"}</button></div></div></WindowDialog>}
    {editing && <WindowDialog title={editing === "new" ? "新建公告" : "编辑公告"} subtitle="ANNOUNCEMENT" onClose={() => { if (!busy) setEditing(null); }}><form className="editor announcement-editor" onSubmit={save}><label>标题<input value={title} onChange={event => setTitle(event.target.value)} maxLength={80} required autoFocus/></label><label>正文<textarea value={body} onChange={event => setBody(event.target.value)} maxLength={10000} rows={10} required/></label><label className="announcement-publish"><input type="checkbox" checked={published} onChange={event => setPublished(event.target.checked)}/>发布到首页公告栏</label>{editorError && <p className="form-error" role="alert">{editorError}</p>}<div className="dialog-actions"><button type="button" className="key" disabled={busy} onClick={() => setEditing(null)}>取消</button><button className="key hot-key" disabled={busy}>{busy ? "保存中…" : published ? "保存并发布" : "保存草稿"}</button></div></form></WindowDialog>}
  </div>;
}

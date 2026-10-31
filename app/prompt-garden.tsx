"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUpRight, Check, FileText, MessageSquareText, Plus, RefreshCw, Search, Sprout, Star, UserRound, X } from "lucide-react";
import { AccountName } from "@/components/account-name";
import { UsageStats } from "@/components/usage-stats";
import { TagAutocomplete } from "@/components/tag-autocomplete";
import { SearchMatch } from "@/components/search-match";
import { readCatalogState, writeCatalogState } from "@/lib/catalog-url";

import { TemplateFileList } from "@/components/template-file-list";
import AccountPanel from "./account-panel";
import PublicProfile, { type PublicProfileData } from "./public-profile";
import NotificationCenter from "./notification-center";
import AccountEntry from "./account-entry";
import { markNotificationRead } from "@/lib/notification-client";
import AnnouncementBoard from "./announcement-board";
import { Led } from "@/components/retro";
import { normalizeVersion, supportsVersion } from "@/lib/version-range.mjs";
import { ThemeToggle } from "@/components/theme";
import { fieldLabels, filledConfigFields, fuzzyMatches, promptTitle, samples, templateCategories, type Category, type CommunityStats, type Kind, type PromptItem } from "@/lib/prompts";
import { formatSearch, parseSearch } from "@/lib/search";
import { promptSortOptions, type PromptSort } from "@/lib/prompt-sort";
import PromptComposer from "./prompt-composer";
import PromptDetail from "./prompt-detail";
import { type LoginUser } from "./test-login";

type Filter = "全部" | Category;
type ListResponse = { error?: string; items?: PromptItem[]; stats?: Record<string, CommunityStats>; hasMore?: boolean };
const emptyStats: CommunityStats = { average: null, ratingsCount: 0, commentCount: 0, copyCount: 0, downloadCount: 0 };

function ArchiveCard({ item, stats, onOpen, onTag }: { item: PromptItem; stats: CommunityStats; onOpen: () => void; onTag: (tag: string) => void }) {
  const fields = filledConfigFields(item.fields);
  const firstValue = fields.length ? item.fields[fields[0]] : undefined;
  const preview = item.kind === "template" ? item.templateContent : Array.isArray(firstValue) ? firstValue.join(" / ") : firstValue === undefined ? "" : String(firstValue);
  const Icon = item.kind === "template" ? FileText : item.fields.personality ? Sprout : MessageSquareText;
  return <article className="archive-card">
    <button className="card-open" onClick={onOpen} aria-label={`查看 ${promptTitle(item)}`}>
      <span className="card-topline"><span className="card-type">{item.kind === "template" ? item.category || "Prompt 模板" : `${fields.length} 项配置`}</span><span className="card-ref">{item.sample ? "SAMPLE" : item.kind === "template" ? "TEMPLATE" : "CONFIG"}{item.kind === "template" && item.templateLocale ? ` / ${item.templateLocale}` : ""}</span></span>
      <span className="card-heading"><span className="card-icon"><Icon size={19}/></span><span className="card-name">{promptTitle(item)}</span><ArrowUpRight size={16}/></span>
      {item.kind === "template" && <TemplateFileList item={item}/>}
      {item.kind === "config" && <span className="card-contents">{fields.map(key => <span key={key}>{fieldLabels[key]}</span>)}</span>}
      {item.description && <span className="card-description">{item.description}</span>}
      {item.searchMatch ? <SearchMatch match={item.searchMatch}/> : <span className="card-preview"><span className="card-preview-text">{preview || "配置片段"}</span></span>}
      <span className="card-stats"><span><Star size={13}/>{stats.average === null ? "暂无评分" : `${stats.average.toFixed(1)} (${stats.ratingsCount})`}</span><span><MessageSquareText size={13}/>{stats.commentCount}</span><UsageStats stats={stats}/></span>
    </button>
    <div className="card-bottom"><span className="card-author"><AccountName name={item.author} tag={item.authorTag} profileTag={item.authorProfileTag}/></span><span className="card-tags">{item.tags.slice(0, 2).map(tag => <button key={tag} onClick={() => onTag(tag)}>#{tag}</button>)}</span></div>
  </article>;
}

export default function PromptGarden({ initialUser, initialView = "library", profile }: { initialUser: LoginUser | null; initialView?: "library" | "account" | "profile"; profile?: PublicProfileData }) {
  const isAccount = initialView === "account";
  const isProfile = initialView === "profile";
  const [focusCommentId,setFocusCommentId] = useState<string|null>(null);
  const [showAnnouncements, setShowAnnouncements] = useState(false);
  const [user, setUser] = useState(initialUser);
  const signedIn = !!user;
  const [kind, setKind] = useState<Kind>("config");
  const [filter, setFilter] = useState<Filter>("全部");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [versionInput, setVersionInput] = useState("");
  const [version, setVersion] = useState("");
  const versionError = versionInput.trim() !== "" && normalizeVersion(versionInput) === null;
  const [sort, setSort] = useState<PromptSort | "">("");
  const [catalogReady, setCatalogReady] = useState(false);
  const [selectedPrompt, setSelectedPrompt] = useState("");
  const libraryGeneration = useRef(0);
  const [items, setItems] = useState<PromptItem[]>([]);
  const [stats, setStats] = useState<Record<string, CommunityStats>>({});
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(!isAccount && !isProfile);
  const [loadError, setLoadError] = useState("");
  const [detail, setDetail] = useState<PromptItem | null>(null);
  const [composing, setComposing] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<PromptItem | null>(null);
  const [revision, setRevision] = useState(0);
  const [toast, setToast] = useState("");
  const editingId = editingItem?.id;
  const published = useCallback((next: Kind) => {
    setShowAnnouncements(false); setComposing(false); setKind(next); setFilter("全部"); setSearch(""); setDebounced(""); setVersion(""); setVersionInput(""); setRevision(value => value + 1); setToast(editingId ? "修改已保存" : "发布成功"); setEditingItem(null);
  }, [editingId]);
  const { query, tags } = useMemo(() => parseSearch(debounced), [debounced]);
  const hasSearch = !!query || tags.length > 0;
  const effectiveSort = sort || (hasSearch ? "relevance" : "combined");
  useEffect(() => {
    if (isAccount || isProfile) return;
    const restore = () => {
      const params = new URLSearchParams(window.location.search), state = readCatalogState(params);
      setSearch(state.search); setDebounced(state.search); setKind(state.kind); setFilter(state.category);
      setVersion(state.version); setVersionInput(state.version); setSort(state.sort);
      setSelectedPrompt(params.get("prompt")?.slice(0, 100) ?? "");
      setFocusCommentId(params.get("comment"));
      setShowAnnouncements(false); setCatalogReady(true);
    };
    // The URL/popstate subscription initializes browser state before catalog requests.
    restore(); window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, [isAccount, isProfile]);
  useEffect(() => {
    if (!catalogReady || isAccount || isProfile) return;
    const current = new URL(window.location.href);
    const next = writeCatalogState(current, { search: debounced, kind, category: filter, version, sort });
    if (next.href !== current.href) window.history.replaceState(window.history.state, "", `${next.pathname}${next.search}${next.hash}`);
  }, [catalogReady, isAccount, isProfile, debounced, kind, filter, version, sort]);
  useEffect(() => { const timer = setTimeout(() => setDebounced(search.trim()), 250); return () => clearTimeout(timer); }, [search]);
  useEffect(() => {
    const timer = setTimeout(() => { const value = versionInput.trim() ? normalizeVersion(versionInput) : ""; if (value !== null) setVersion(value); }, 250);
    return () => clearTimeout(timer);
  }, [versionInput]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(""), 2800); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => {
    const url = new URL(window.location.href);
    const code = url.searchParams.get("auth_error");
    const errors: Record<string, string> = {
      invalid_state: "登录请求无法验证，请重新开始。", flow_expired: "登录已过期，请重新开始。",
      link_expired: "账号状态已变化，请登录后重新绑定。", identity_conflict: "该授权身份已绑定其他账号，或当前账号已绑定此平台。",
      not_ready: "该登录方式尚未配置完成，请稍后重试。", denied: "你已取消本次授权。", failed: "授权登录未完成，请重试。",
      canonical: "请在正式域名登录后重新绑定。",
    };
    // eslint-disable-next-line react-hooks/set-state-in-effect -- OAuth callback messages are consumed from the browser URL once the server identity is known.
    if (code) { setToast(errors[code] ?? errors.failed); url.searchParams.delete("auth_error"); }
    if (user && url.searchParams.get("compose") === "1") { setComposing(true); url.searchParams.delete("compose"); }
    if (url.searchParams.has("auth_linked")) { setToast("授权登录方式已绑定"); url.searchParams.delete("auth_linked"); }
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, [user]);
  useEffect(() => {
    if (!catalogReady || isAccount || isProfile) return;
    const id = selectedPrompt;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Synchronize the selected URL target before its async detail/comment lookup.
    setFocusCommentId(new URLSearchParams(window.location.search).get("comment"));
    if (!id) { setDetail(null); return; }
    const sample = samples.find(item => item.id === id);
    if (sample) { setKind(sample.kind); setDetail(sample); return; }
    const controller = new AbortController();
    fetch(`/api/prompts/${encodeURIComponent(id)}`, { signal: controller.signal }).then(async response => {
      const data = await response.json() as { error?: string; item?: PromptItem };
      if (!response.ok || !data.item) throw new Error(data.error || "作品不存在或已删除。");
      setKind(data.item.kind); setDetail(data.item);
    }).catch(error => { if (error.name !== "AbortError") setToast(error.message); });
    return () => controller.abort();
  }, [selectedPrompt, catalogReady, isAccount, isProfile]);
  const readTargetNotification = useCallback(() => {
    const url = new URL(window.location.href);
    const value = url.searchParams.get("notification");
    if (value && /^[1-9]\d{0,14}$/.test(value)) {
      void markNotificationRead(Number(value)).then(() => { url.searchParams.delete("notification"); window.history.replaceState(null,"",`${url.pathname}${url.search}${url.hash}`); }).catch(() => setToast("内容已打开，标记已读失败，可在消息中心重试。"));
    }
  },[]);
  useEffect(() => { if (detail && !focusCommentId) readTargetNotification(); },[detail,focusCommentId,readTargetNotification]);
  const queryUrl = useCallback((offset = 0) => {
    const params = new URLSearchParams({ q: query, offset: String(offset), kind, sort: effectiveSort });
    if (kind === "template" && filter !== "全部") params.set("category", filter);
    if (version) params.set("version", version);
    for (const tag of tags) params.append("tag", tag);
    return `/api/prompts?${params}`;
  }, [query, filter, kind, tags, version, effectiveSort]);
  useEffect(() => {
    if (isAccount || isProfile || !catalogReady) return;
    libraryGeneration.current++;
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Filters, debouncing and server revisions all replace the active catalog request.
    setLoading(true); setLoadError(""); setHasMore(false);
    fetch(queryUrl(), { signal: controller.signal }).then(async response => {
      const data = await response.json() as ListResponse;
      if (!response.ok) throw new Error(data.error || "作品加载失败。");
      setItems(data.items ?? []); setStats(previous => ({ ...previous, ...data.stats })); setHasMore(Boolean(data.hasMore));
    }).catch(error => { if (error.name !== "AbortError") { setItems([]); setLoadError(error.message); } }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [queryUrl, revision, isAccount, isProfile, catalogReady]);
  const matchingSamples = useMemo(() => samples.filter(item => {
    if (item.kind !== kind || (kind === "template" && filter !== "全部" && item.category !== filter)) return false;
    if (version && !supportsVersion(item, version)) return false;
    if (!tags.every(tag => item.tags.some(value => value.toLocaleLowerCase() === tag.toLocaleLowerCase()))) return false;
    const values = [item.title, item.description, item.author, ...item.tags, ...Object.values(item.fields).map(String), item.templateName ?? "", item.templateContent ?? ""];
    return fuzzyMatches(values, query);
  }), [kind, filter, tags, query, version]);
  const visible = [...items, ...matchingSamples];
  const closeDetail = () => {
    setDetail(null); setSelectedPrompt(""); setFocusCommentId(null);
    const url = new URL(window.location.href);
    if (url.searchParams.has("prompt")) { url.searchParams.delete("prompt"); url.searchParams.delete("comment"); url.searchParams.delete("notification"); window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`); }
  };
  const chooseTag = (value: string) => setSearch(previous => {
    const parsed = parseSearch(previous);
    const selected = parsed.tags.some(tag => tag.toLocaleLowerCase() === value.toLocaleLowerCase());
    return formatSearch(parsed.query, selected ? parsed.tags.filter(tag => tag.toLocaleLowerCase() !== value.toLocaleLowerCase()) : [...parsed.tags, value].slice(0, 5));
  });
  const changeKind = (next: Kind) => { setShowAnnouncements(false); setKind(next); setFilter("全部"); };
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- Cross the auth boundary with fresh server session and router state.
  const requestLogin = (publishing = false) => { window.location.assign(`/login?returnTo=${encodeURIComponent(publishing ? "/?compose=1" : isAccount ? "/account" : window.location.pathname + window.location.search + window.location.hash)}`); };
  const logout = async () => {
    try {
      const response = await fetch(user?.kind === "oauth" ? "/api/auth/signout" : "/api/test-session", { method: user?.kind === "oauth" ? "POST" : "DELETE" });
      if (!response.ok) throw new Error("退出失败。");
      setUser(null); setDetail(null); setComposing(false); setRevision(value => value + 1); setToast("已退出");
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- A completed sign-out must discard cached authenticated pages.
      if (isAccount) window.location.assign("/login?returnTo=%2Faccount");
    } catch { setToast("退出失败，请重试。"); }
  };
  const openItem = async (item: PromptItem) => {
    setFocusCommentId(null);
    if (item.sample) { setDetail(item); return; }
    try {
      const response = await fetch(`/api/prompts/${encodeURIComponent(item.id)}`);
      const data = await response.json() as { error?: string; item?: PromptItem };
      if (!response.ok || !data.item) throw new Error(data.error || "作品不存在或已删除。");
      setDetail(data.item);
      if (!isAccount) {
        // Flush pending input before creating the detail entry, so Back restores
        // even changes made within the search debounce window.
        const url = writeCatalogState(new URL(window.location.href), { search, kind, category: filter, version: normalizeVersion(versionInput) ?? version, sort });
        url.searchParams.delete("prompt");
        window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
        url.searchParams.set("prompt", item.id);
        window.history.pushState(null, "", `${url.pathname}${url.search}${url.hash}`);
        setSelectedPrompt(item.id);
      }
    } catch (error) { setToast(error instanceof Error ? error.message : "加载失败。"); }
  };
  const editItem = async (item: PromptItem) => {
    try {
      const response = await fetch(`/api/prompts/${encodeURIComponent(item.id)}`);
      const data = await response.json() as { error?: string; item?: PromptItem };
      if (!response.ok || !data.item?.mine) throw new Error(data.error || "无权修改这篇作品。");
      closeDetail(); setEditingItem(data.item); setComposing(true);
    } catch (cause) { setToast(cause instanceof Error ? cause.message : "加载失败。"); }
  };
  const updateStats = useCallback((id: string, next: CommunityStats, changed = false) => { setStats(previous => ({ ...previous, [id]: next })); if (isAccount || (changed && sort !== "latest")) setRevision(value => value + 1); }, [isAccount, sort]);
  const loadMore = async () => {
    const generation = libraryGeneration.current;
    setLoading(true);
    try { const response = await fetch(queryUrl(items.length)); const data = await response.json() as ListResponse; if (generation !== libraryGeneration.current) return; if (!response.ok) throw new Error(data.error || "加载失败。"); setItems(previous => [...previous, ...(data.items ?? [])]); setStats(previous => ({ ...previous, ...data.stats })); setHasMore(Boolean(data.hasMore)); }
    catch (error) { if (generation === libraryGeneration.current) setLoadError(error instanceof Error ? error.message : "加载失败。"); }
    finally { if (generation === libraryGeneration.current) setLoading(false); }
  };
  const remove = async (item: PromptItem) => {
    if (deletingId) return;
    if (!window.confirm(`确定删除「${promptTitle(item)}」及其评论和评分？此操作无法撤销。`)) return;
    setDeletingId(item.id);
    try { const response = await fetch(`/api/prompts/${encodeURIComponent(item.id)}`, { method: "DELETE" }); const data = await response.json() as { error?: string }; if (!response.ok) throw new Error(data.error || "删除失败。"); closeDetail(); setRevision(value => value + 1); setToast("已删除分享"); }
    catch (error) { setToast(error instanceof Error ? error.message : "删除失败。"); }
    finally { setDeletingId(null); }
  };
  return <div className="desktop"><div className="app-window">
    <header className="titlebar"><div className="brand"><Led/><span className="nameplate">MAI / PROMPT</span><span className="brand-cn">麦麦提示词库</span></div><div className="title-actions"><ThemeToggle/>{user && <NotificationCenter key={user.accountTag}/>} <AccountEntry signedIn={signedIn}/><button className="key hot-key publish-key" aria-label="发布作品" title="发布作品" onClick={() => { setEditingItem(null); if (signedIn) setComposing(true); else requestLogin(true); }}><Plus size={16}/><span>发布作品</span></button></div></header>
    <nav className={`folder-tabs ${isAccount || isProfile ? "" : "library-tabs"}`} aria-label="内容类型">{isAccount || isProfile ? <><Link className="folder-tab" href="/" prefetch={false}>返回提示词库</Link><span className="folder-tab selected">{isProfile ? "个人主页" : "账号中心"}</span></> : <><button className={`folder-tab ${!showAnnouncements && kind === "config" ? "selected" : ""}`} onClick={() => changeKind("config")} aria-pressed={!showAnnouncements && kind === "config"}>人格与聊天配置</button><button className={`folder-tab ${!showAnnouncements && kind === "template" ? "selected" : ""}`} onClick={() => changeKind("template")} aria-pressed={!showAnnouncements && kind === "template"}>Prompt 管理</button><button className={`folder-tab ${showAnnouncements ? "selected" : ""}`} onClick={() => { setShowAnnouncements(true); setLoading(false); }} aria-pressed={showAnnouncements}>公告栏</button></>}</nav>
    <main className="workspace">{isProfile && profile ? <PublicProfile profile={profile} onOpen={openItem}/> : isAccount ? user ? <AccountPanel onLogout={logout} user={user} revision={revision} onUser={next => { setUser(next); setRevision(value => value + 1); }} onOpen={openItem} onEdit={editItem} onDelete={remove} deletingId={deletingId} notify={setToast}/> : <div className="account-login-screen"><UserRound size={30}/><h1>账号中心</h1><button className="key hot-key" onClick={() => requestLogin()}>登录</button></div> : <><div className="workspace-heading"><div><div className="kicker"><span>◆</span> MAIBOT / PROMPT EXCHANGE</div><h1>{showAnnouncements ? "公告栏" : kind === "config" ? "人格与聊天配置" : "Prompt 管理"}<span> _</span></h1></div><div className="heading-status"><Led label="PUBLIC ACCESS"/></div></div>
      {showAnnouncements ? <AnnouncementBoard/> : <>
      <div className="control-panel">
        <div className="control-title"><span>检索</span><small>SEARCH</small></div>
        <div className="search-combo">
          <div className="search-row"><label className="search-screen"><Search size={17}/><span className="sr-only">搜索关键词或标签</span><TagAutocomplete mode="search" value={search} onChange={setSearch} kind={kind} label="搜索关键词或标签" placeholder="搜索关键词或 #标签"/>{search && <button type="button" className="search-clear" onClick={() => setSearch("")} aria-label="清空搜索"><X size={14}/></button>}</label><label className="search-screen version-input"><span className="version-input-label">我的版本</span><input aria-label="我的 MaiBot 版本" value={versionInput} onChange={event => setVersionInput(event.target.value)} onBlur={() => { const value = normalizeVersion(versionInput); if (value) setVersionInput(value); }} maxLength={40} placeholder="例如 1.2.5" aria-invalid={versionError} aria-describedby={versionError ? "version-filter-error" : undefined}/>{versionInput && <button type="button" className="search-clear" onClick={() => { setVersionInput(""); setVersion(""); }} aria-label="清空版本筛选"><X size={14}/></button>}</label></div>
          {versionError && <p id="version-filter-error" className="version-filter-error" role="status">请输入数字版本，例如 1.2.5。</p>}
        </div>
        <button className="key icon-key refresh-key" onClick={() => setRevision(value => value + 1)} aria-label="刷新列表"><RefreshCw size={16}/></button>
      </div>
      <section className="library-panel" aria-label="作品列表">
        <div className="panel-bar library-toolbar">
          <div className="library-title-group"><span className="panel-dot">◆</span><strong>{kind === "config" ? "配置作品" : "Prompt 模板"}</strong><small>PROMPT LIBRARY</small><span className="library-count" aria-live="polite" aria-label={loading ? "正在加载作品" : `${visible.length} 篇作品`}>{loading ? "…" : visible.length}</span></div>
          <div className="sort-options" role="group" aria-label="结果排序">{promptSortOptions.filter(option => option.value !== "relevance" || hasSearch || sort === "relevance").map(option => <button type="button" key={option.value} aria-pressed={effectiveSort === option.value} onClick={() => setSort(option.value)}>{option.label}</button>)}</div>
        </div>
        {kind === "template" && <div className="subcategories" role="group" aria-label="细分类别">{(["全部", ...templateCategories] as Filter[]).map(value => <button key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)} aria-pressed={filter === value}>{value}</button>)}</div>}
        {loadError && <div className="load-error" role="alert">{loadError} <button onClick={() => setRevision(value => value + 1)}>重试</button></div>}
        {visible.length ? <div className="card-grid">{visible.map(item => <ArchiveCard key={item.id} item={item} stats={stats[item.id] ?? emptyStats} onOpen={() => openItem(item)} onTag={chooseTag}/>)}</div> : !loading && <div className="empty-screen"><Search size={22}/><strong>没有找到作品</strong><span>换个关键词或标签试试</span></div>}
        {hasMore && <div className="more-row"><button className="key" disabled={loading} onClick={loadMore}>{loading ? "加载中…" : "加载更多"}<ArrowDown size={14}/></button></div>}
      </section></>}
      </>}<div className="statusbar"><span><Led/> {loading ? "正在读取" : "就绪"}</span><span>MAIBOT COMMUNITY / PROMPTS</span><span>{user ? "已登录" : "访客模式"}</span></div>
    </main></div>
    {detail && <PromptDetail key={`${detail.id}:${focusCommentId || ""}`} focusCommentId={focusCommentId} onLocated={readTargetNotification} item={detail} stats={stats[detail.id] ?? emptyStats} signedIn={signedIn} onLogin={() => requestLogin()} onClose={closeDetail} onDelete={remove} onEdit={editItem} onStats={updateStats} onTag={isAccount ? undefined : value => { chooseTag(value); closeDetail(); }} notify={setToast}/>}
    {composing && user && <PromptComposer key={editingItem?.id ?? "new"} initialKind={kind} initialItem={editingItem} onClose={() => { setComposing(false); setEditingItem(null); }} onPublished={published}/>}
    {toast && <div className="toast" role="status"><Check size={15}/>{toast}</div>}
  </div>;
}

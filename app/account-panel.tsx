"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { FileText, GitBranch, Mail, Pencil, RefreshCw, Save, ShieldCheck, LogOut, Trash2, UserRound } from "lucide-react";
import { formatVersionRange } from "@/lib/version-range.mjs";
import { AccountName } from "@/components/account-name";
import { TemplateFileList } from "@/components/template-file-list";
import { promptTitle, type PromptItem } from "@/lib/prompts";
import { useAuthorWorks } from "@/hooks/use-author-works";
import { WorkPagination } from "@/components/work-pagination";
import { WorkListScroll } from "@/components/work-list-scroll";
import scrollStyles from "@/components/work-list-scroll.module.css";
import type { LoginUser, ProviderStatus } from "./test-login";
import EmailAuthForm from "./email-auth-form";
import AccountReviews, { type PendingSummary } from "./account-reviews";

export default function AccountPanel({ onLogout, user, revision, onUser, onOpen, onEdit, onDelete, deletingId, notify }: { onLogout: () => void; user: LoginUser; revision: number; onUser: (user: LoginUser) => void; onOpen: (item: PromptItem) => void; onEdit: (item: PromptItem) => void; onDelete: (item: PromptItem) => void; deletingId: string | null; notify: (message: string) => void }) {
  const [displayName, setDisplayName] = useState(user.displayName);
  const [saving, setSaving] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [pending, setPending] = useState<PendingSummary>({ count: 0, loading: true, failed: false });
  const { kind, pageIndex, items, stats, hasMore, loading, error, changeKind, changePage, retryLoad } = useAuthorWorks({ scope: "mine=1", revision, refresh, enabled: !pending.loading });
  const reviewSettled = useCallback(() => setRefresh(value => value + 1), []);
  const [securityOpen, setSecurityOpen] = useState(false);
  const [auth, setAuth] = useState<ProviderStatus | null>(null);
  useEffect(() => {
    fetch("/api/auth/providers").then(async response => { if (response.ok) setAuth(await response.json() as ProviderStatus); }).catch(() => {});
  }, [user]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- The server-normalized account name must replace the editable draft after a profile update.
  useEffect(() => { setDisplayName(user.displayName); }, [user.displayName]);
  const saveProfile = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setProfileError("");
    try {
      const response = await fetch("/api/account", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ displayName }) });
      const data = await response.json() as { error?: string; user?: LoginUser };
      if (!response.ok || !data.user) throw new Error(data.error || "保存失败。");
      onUser(data.user); notify("昵称已保存");
    } catch (cause) { setProfileError(cause instanceof Error ? cause.message : "保存失败。"); }
    finally { setSaving(false); }
  };

  return <>
    <div className="workspace-heading"><div><h1>账号中心<span> _</span></h1></div></div>
    <div className="account-layout">
      <aside className="account-sidebar">
        <section className="account-box"><div className="panel-bar"><div><UserRound size={15}/><strong>账号资料</strong></div></div><div className="account-profile-content"><div className="account-current-name"><AccountName name={user.displayName} tag={user.accountTag}/></div><a className="text-link profile-own-link" href={`/u/${user.accountTag}`}>查看公开主页</a><form className="editor" onSubmit={saveProfile}><label>昵称<input value={displayName} onChange={event => setDisplayName(event.target.value)} maxLength={24} required autoComplete="nickname"/></label>{profileError && <p className="form-error" role="alert">{profileError}</p>}<button className="key" disabled={saving || displayName.trim() === user.displayName}><Save size={14}/>{saving ? "保存中…" : "保存昵称"}</button></form></div></section>
        {auth?.formal && <section className="account-box"><div className="panel-bar"><div><Mail size={15}/><strong>邮箱与密码</strong></div></div><div className="account-providers account-security">
          {auth.email.linked ? <><p className="account-email-address">{auth.email.address}</p><div className="account-provider-row"><span>密码</span><small>{auth.email.hasPassword ? "已设置" : "未设置"}</small></div><button type="button" className="key small-key" onClick={() => setSecurityOpen(value => !value)} aria-expanded={securityOpen}>{securityOpen ? "取消" : auth.email.hasPassword ? "更改密码" : "设置密码"}</button>{securityOpen && <EmailAuthForm purpose="set-password" address={auth.email.address ?? ""}/>}</> : auth.email.enabled ? <EmailAuthForm purpose="link"/> : <p className="account-provider-note">邮箱服务暂不可用。</p>}
        </div></section>}
        {auth?.formal && auth.providers.some(provider => provider.enabled || provider.linked) && <section className="account-box"><div className="panel-bar"><strong>第三方账号</strong></div><div className="account-providers">{auth.providers.filter(provider => provider.enabled || provider.linked).map(provider => <div className="account-provider-row" key={provider.id}><span>{provider.id === "github" ? <GitBranch size={15}/> : <span className="provider-google" aria-hidden="true">G</span>}{provider.id === "github" ? "GitHub" : "Google"}</span>{provider.linked ? <small>已绑定</small> : <form method="post" action={`/api/auth/link/${provider.id}`}><button className="key small-key">绑定</button></form>}</div>)}</div></section>}

        <section className="account-box"><div className="panel-bar"><strong>账号操作</strong></div><div className="account-actions">
          {user.role === "admin" && <a className="key" href="/admin"><ShieldCheck size={15}/>管理面板</a>}
          <button type="button" className="key" onClick={onLogout}><LogOut size={15}/>退出登录</button>
        </div></section>

      </aside>
      <section className={`library-panel account-library ${scrollStyles.panel}`} aria-label="我的发布"><div className="panel-bar"><div><FileText size={15}/><strong>我的发布</strong></div><button type="button" className="key icon-key small-key" onClick={() => setRefresh(value => value + 1)} aria-label="刷新我的发布"><RefreshCw size={14}/></button></div>
        <div className="subcategories" role="group" aria-label="我的作品类型">{([{ value: "", label: "全部" }, { value: "config", label: "人格与聊天配置" }, { value: "template", label: "Prompt 管理" }] as const).map(option => <button type="button" key={option.value} onClick={() => changeKind(option.value)} aria-pressed={kind === option.value} className={kind === option.value ? "active" : ""}>{option.label}</button>)}</div>
        <WorkListScroll label="我的发布列表" resetKey={`${kind}:${pageIndex}`}>
        {error && <p className="load-error" role="alert">{error} <button type="button" className="text-link" onClick={retryLoad}>重试</button></p>}
        <AccountReviews key={user.accountTag} kind={kind} revision={revision} refresh={refresh} onSummary={setPending} onSettled={reviewSettled}/>
        <div className="account-works">{items.map(item => <article className="account-work" key={item.id}><div className="account-work-heading"><span className="card-type">{item.kind === "config" ? "人格与聊天配置" : "Prompt 管理"}</span><span className="account-work-version">{formatVersionRange(item)}</span></div><button type="button" className="account-work-title" onClick={() => onOpen(item)}>{promptTitle(item)}</button>{item.kind === "template" && <TemplateFileList item={item}/>}{item.description && <p className="account-work-description">{item.description}</p>}<div className="account-work-bottom"><div><time dateTime={item.updatedAt ?? item.createdAt}>{item.updatedAt ? "修改于 " : "发布于 "}{new Date(item.updatedAt ?? item.createdAt).toLocaleDateString("zh-CN")}</time><span>{stats[item.id]?.commentCount ?? 0} 条评论</span></div><span className="account-work-actions"><button type="button" className="key small-key" onClick={() => onEdit(item)} disabled={deletingId === item.id} aria-label={`编辑 ${promptTitle(item)}`}><Pencil size={13}/>编辑</button><button type="button" className="key small-key danger-key" onClick={() => onDelete(item)} disabled={deletingId !== null} aria-label={`删除 ${promptTitle(item)}`}><Trash2 size={13}/>{deletingId === item.id ? "删除中…" : "删除"}</button></span></div></article>)}</div>
        {!loading && !pending.loading && !items.length && !pending.count && !error && !pending.failed && <div className="empty-screen"><FileText size={22}/><strong>暂无发布</strong></div>}
        {loading && !items.length && <p className="account-loading" role="status">加载中…</p>}
        </WorkListScroll>
        {(items.length > 0 || pageIndex > 0) && <WorkPagination label="我的发布分页" pageIndex={pageIndex} hasMore={hasMore} loading={loading} onPage={changePage}/>}
      </section>
    </div>
  </>;
}

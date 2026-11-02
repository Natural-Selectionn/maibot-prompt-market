"use client";

import { FileText, UserRound } from "lucide-react";
import type { PromptItem } from "@/lib/prompts";
import { promptTitle } from "@/lib/prompts";
import { formatVersionRange } from "@/lib/version-range.mjs";
import { TemplateFileList } from "@/components/template-file-list";
import { WorkPagination } from "@/components/work-pagination";
import { useAuthorWorks } from "@/hooks/use-author-works";
import { WorkListScroll } from "@/components/work-list-scroll";
import scrollStyles from "@/components/work-list-scroll.module.css";

export type PublicProfileData = {accountTag:string;displayName:string;worksCount:number};

type Props = {profile:PublicProfileData;onOpen:(item:PromptItem)=>void};

export default function PublicProfile(props: Props) {
  return <ProfileWorks key={props.profile.accountTag} {...props}/>;
}

function ProfileWorks({profile,onOpen}: Props) {
  const { kind, pageIndex, items, stats, hasMore, loading, error, changeKind, changePage, retryLoad } = useAuthorWorks({ scope: `author=${profile.accountTag}` });
  return <>
    <div className="workspace-heading profile-heading"><div><div className="kicker">PUBLIC PROFILE</div><h1><UserRound size={25}/>{profile.displayName}</h1><span className="profile-number">#{profile.accountTag} · {profile.worksCount} 篇公开作品</span></div></div>
    <section className={`library-panel ${scrollStyles.panel}`} aria-label="作者的公开作品"><div className="panel-bar"><div><FileText size={15}/><strong>公开作品</strong></div></div>
      <div className="subcategories" aria-label="作品类型">{([{value:"",label:"全部"},{value:"config",label:"人格与聊天配置"},{value:"template",label:"Prompt 管理"}] as const).map(option=><button key={option.value} type="button" className={kind===option.value ? "active" : ""} aria-pressed={kind===option.value} onClick={()=>changeKind(option.value)}>{option.label}</button>)}</div>
      <WorkListScroll label="公开作品列表" resetKey={`${kind}:${pageIndex}`}>
      {error && <p className="form-error" role="alert">{error} <button className="text-link" onClick={retryLoad}>重试</button></p>}
      <div className="account-works">{items.map(item=><article className="account-work" key={item.id}><div className="account-work-heading"><span className="card-type">{item.kind==="config" ? "人格与聊天配置" : "Prompt 管理"}</span><span>{formatVersionRange(item)}</span></div><button type="button" className="account-work-title" onClick={()=>onOpen(item)}>{promptTitle(item)}</button>{item.kind==="template" && <TemplateFileList item={item}/>} {item.description && <p className="account-work-description">{item.description}</p>}<div className="account-work-bottom"><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleDateString("zh-CN")}</time><span>{stats[item.id]?.commentCount || 0} 条评论 · {stats[item.id]?.average?.toFixed(1) || "暂无评分"}</span></div></article>)}</div>
      {loading && <p role="status" className="account-loading">正在读取作品…</p>}{!loading && !error && items.length===0 && <div className="empty-screen"><FileText size={24}/><strong>暂无公开作品</strong></div>}
      </WorkListScroll>
      {(items.length > 0 || pageIndex > 0) && <WorkPagination label="公开作品分页" pageIndex={pageIndex} hasMore={hasMore} loading={loading} onPage={changePage}/>}
    </section>
  </>;
}

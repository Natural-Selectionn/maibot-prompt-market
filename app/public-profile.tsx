"use client";

import { useEffect, useRef, useState } from "react";
import { FileText, UserRound } from "lucide-react";
import type { CommunityStats, Kind, PromptItem } from "@/lib/prompts";
import { promptTitle } from "@/lib/prompts";
import { formatVersionRange } from "@/lib/version-range.mjs";
import { TemplateFileList } from "@/components/template-file-list";

export type PublicProfileData = {accountTag:string;displayName:string;worksCount:number};
type Page = {items:PromptItem[];stats:Record<string,CommunityStats>;hasMore:boolean;error?:string};

type Props = {profile:PublicProfileData;onOpen:(item:PromptItem)=>void};

export default function PublicProfile(props: Props) {
  return <ProfileWorks key={props.profile.accountTag} {...props}/>;
}

function ProfileWorks({profile,onOpen}: Props) {
  const [kind,setKind]=useState<Kind|"">("");
  const [page,setPage]=useState<Page|null>(null);
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(true);
  const generation=useRef(0);
  const [retry,setRetry]=useState(0);
  useEffect(()=>{
    generation.current++;
    const controller=new AbortController();
    void fetch(`/api/prompts?author=${profile.accountTag}&kind=${kind}`,{cache:"no-store",signal:controller.signal}).then(async response=>{
      const data=await response.json() as Page;
      if (!response.ok) throw new Error(data.error || "作品暂时加载失败。");
      if (!controller.signal.aborted) setPage(data);
    }).catch(cause=>{if(!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "作品加载失败。");}).finally(()=>{if(!controller.signal.aborted) setLoading(false);});
    return ()=>controller.abort();
  },[profile.accountTag,kind,retry]);
  const beginLoad=()=>{setLoading(true);setError("");setPage(null);};
  const changeKind=(next:Kind|"")=>{if(next!==kind){beginLoad();setKind(next);}};
  const retryLoad=()=>{beginLoad();setRetry(value=>value+1);};
  const more=async()=>{
    if (!page) return;
    const current=generation.current;
    setLoading(true); setError("");
    try {
      const response=await fetch(`/api/prompts?author=${profile.accountTag}&kind=${kind}&offset=${page.items.length}`,{cache:"no-store"});
      const data=await response.json() as Page;
      if (!response.ok) throw new Error(data.error || "作品加载失败。");
      if(current!==generation.current) return;
      setPage(previous=>previous ? {...data,items:[...previous.items,...data.items]} : data);
    } catch(cause) {if(current===generation.current) setError(cause instanceof Error ? cause.message : "作品加载失败。");}
    finally {if(current===generation.current) setLoading(false);}
  };
  return <>
    <div className="workspace-heading profile-heading"><div><div className="kicker">PUBLIC PROFILE</div><h1><UserRound size={25}/>{profile.displayName}</h1><span className="profile-number">#{profile.accountTag} · {profile.worksCount} 篇公开作品</span></div></div>
    <section className="library-panel" aria-label="作者的公开作品"><div className="panel-bar"><div><FileText size={15}/><strong>公开作品</strong></div></div>
      <div className="subcategories" aria-label="作品类型">{([{value:"",label:"全部"},{value:"config",label:"人格与聊天配置"},{value:"template",label:"Prompt 管理"}] as const).map(option=><button key={option.value} type="button" className={kind===option.value ? "active" : ""} aria-pressed={kind===option.value} onClick={()=>changeKind(option.value)}>{option.label}</button>)}</div>
      {error && <p className="form-error" role="alert">{error} <button className="text-link" onClick={retryLoad}>重试</button></p>}
      <div className="account-works">{page?.items.map(item=><article className="account-work" key={item.id}><div className="account-work-heading"><span className="card-type">{item.kind==="config" ? "人格与聊天配置" : "Prompt 管理"}</span><span>{formatVersionRange(item)}</span></div><button type="button" className="account-work-title" onClick={()=>onOpen(item)}>{promptTitle(item)}</button>{item.kind==="template" && <TemplateFileList item={item}/>} {item.description && <p className="account-work-description">{item.description}</p>}<div className="account-work-bottom"><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleDateString("zh-CN")}</time><span>{page.stats[item.id]?.commentCount || 0} 条评论 · {page.stats[item.id]?.average?.toFixed(1) || "暂无评分"}</span></div></article>)}</div>
      {loading && <p role="status" className="account-loading">正在读取作品…</p>}{!loading && page?.items.length===0 && <div className="empty-screen"><FileText size={24}/><strong>暂无公开作品</strong></div>}
      {page?.hasMore && <div className="more-row"><button className="key" disabled={loading} onClick={()=>void more()}>加载更多</button></div>}
    </section>
  </>;
}

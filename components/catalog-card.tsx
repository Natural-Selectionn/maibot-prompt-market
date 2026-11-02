"use client";

import { ArrowUpRight, FileText, MessageSquareText, Sprout, Star } from "lucide-react";
import { AccountName } from "@/components/account-name";
import { SearchMatch } from "@/components/search-match";
import { TemplateFileList } from "@/components/template-file-list";
import { UsageStats } from "@/components/usage-stats";
import { fieldLabels, filledConfigFields, promptTitle, type CommunityStats, type PromptItem } from "@/lib/prompts";
import { ContentPreview } from "./catalog-content-preview";

const configPreviewFields = ["personality", "behavior_style", "reply_style"] as const;

export function CatalogCard({ item, stats, onOpen, onTag, expandPreview = false }: { item: PromptItem; stats: CommunityStats; onOpen: () => void; onTag: (tag: string) => void; expandPreview?: boolean }) {
  const fields = filledConfigFields(item.fields);
  const firstValue = fields.length ? item.fields[fields[0]] : undefined;
  const preview = item.kind === "template" ? item.templateContent?.slice(0, expandPreview ? 1200 : 180) : Array.isArray(firstValue) ? firstValue.join(" / ") : firstValue === undefined ? "" : String(firstValue);
  const segments = item.kind === "template"
    ? [{ key: "template", label: "模板正文", text: preview || "" }]
    : configPreviewFields.map(key => ({ key, label: fieldLabels[key], text: item.fields[key] || "" }));
  const Icon = item.kind === "template" ? FileText : item.fields.personality ? Sprout : MessageSquareText;
  return <article className="archive-card">
    <button className="card-open" onClick={onOpen} aria-label={`查看 ${promptTitle(item)}`}>
      <span className="card-topline"><span className="card-type">{item.kind === "template" ? item.category || "Prompt 模板" : `${fields.length} 项配置`}</span><span className="card-ref">{item.sample ? "SAMPLE" : item.kind === "template" ? "TEMPLATE" : "CONFIG"}{item.kind === "template" && item.templateLocale ? ` / ${item.templateLocale}` : ""}</span></span>
      <span className="card-heading"><span className="card-icon"><Icon size={19}/></span><span className="card-name">{promptTitle(item)}</span><ArrowUpRight size={16}/></span>
      {item.kind === "template" && <TemplateFileList item={item}/>}
      {item.kind === "config" && <span className="card-contents">{fields.map(key => <span key={key}>{fieldLabels[key]}</span>)}</span>}
      {item.description && <span className="card-description">{item.description}</span>}
      {item.searchMatch ? <SearchMatch match={item.searchMatch}/> : expandPreview ? <ContentPreview segments={segments} fallback={preview || ""} preserveLineBreaks={item.kind === "config"}/> : <span className="card-preview"><span className="card-preview-text">{preview || "配置片段"}</span></span>}
      <span className="card-stats"><span><Star size={13}/>{stats.average === null ? "暂无评分" : `${stats.average.toFixed(1)} (${stats.ratingsCount})`}</span><span><MessageSquareText size={13}/>{stats.commentCount}</span><UsageStats stats={stats}/></span>
    </button>
    <div className="card-bottom"><span className="card-author"><AccountName name={item.author} tag={item.authorTag} profileTag={item.authorProfileTag}/></span><span className="card-tags">{item.tags.slice(0, 2).map(tag => <button key={tag} onClick={() => onTag(tag)}>#{tag}</button>)}</span></div>
  </article>;
}

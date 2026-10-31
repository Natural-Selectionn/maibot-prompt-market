"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { ArrowUpRight, BookOpenText, ChevronDown, Copy, Download, Pencil, Trash2 } from "lucide-react";
import { formatVersionRange } from "@/lib/version-range.mjs";
import { AccountName } from "@/components/account-name";
import { WindowDialog } from "@/components/retro";
import { UsageStats } from "@/components/usage-stats";
import { prepareUsage, recordUsage } from "@/lib/usage-client";
import { downloadText } from "@/lib/download-text";
import { toPersonalityJson } from "@/lib/personality-export";
import { fieldLabels, fieldPaths, filledConfigFields, getTemplate, promptTitle, templateDownloadName, templateFilesFor, type CommunityStats, type PromptItem } from "@/lib/prompts";
import CommunityPanel from "./community-panel";

function DetailField({ title, caption, filename, initiallyExpanded = true, onCopy, onDownload, children }: { title: string; caption?: string; filename?: boolean; initiallyExpanded?: boolean; onCopy: () => void; onDownload?: () => void; children: ReactNode }) {
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const contentId = useId();
  return <div className="field-panel">
    <div className="field-title">
      <button type="button" className="field-toggle" aria-expanded={expanded} aria-controls={contentId} onClick={() => setExpanded(value => !value)} title={expanded ? "收起此项" : "展开此项"}>
        <ChevronDown className="field-chevron" size={16} aria-hidden="true"/>
        <span><strong className={filename ? "template-file-name" : undefined}>{title}</strong>{caption && <code>{caption}</code>}</span>
      </button>
      <div className="field-actions"><button type="button" className="key small-key" onClick={onCopy}><Copy size={13}/>复制</button>{onDownload && <button type="button" className="key small-key" onClick={onDownload}><Download size={13}/>下载</button>}</div>
    </div>
    <div id={contentId} className="field-body" hidden={!expanded}>{children}</div>
  </div>;
}

export default function PromptDetail({ focusCommentId, onLocated, item, stats, signedIn, onLogin, onClose, onDelete, onEdit, onTag, onStats, notify }: { focusCommentId?: string|null; onLocated?: () => void; item: PromptItem; stats: CommunityStats; signedIn: boolean; onLogin: () => void; onClose: () => void; onDelete: (item: PromptItem) => void; onEdit: (item: PromptItem) => void; onTag?: (tag: string) => void; onStats: (id: string, stats: CommunityStats, changed?: boolean) => void; notify: (message: string) => void }) {
  useEffect(() => { void prepareUsage(true); }, [signedIn]);
  const track = (action: "copy" | "download") => {
    void recordUsage(item.id, action).then(next => { if (next) onStats(item.id, next, true); });
  };
  const copy = async (text: string, label: string, count = true) => {
    try { await navigator.clipboard.writeText(text); notify(`${label}已复制`); if (count) track("copy"); }
    catch { notify("复制失败，请手动选择文字"); }
  };
  const share = () => { const url = new URL("/", window.location.origin); url.searchParams.set("prompt", item.id); copy(url.toString(), "链接", false); };
  const download = (content: string, filename: string, mimeType?: string) => {
    try { downloadText(content, filename, mimeType); track("download"); }
    catch { notify("下载未能启动，请重试。"); }
  };
  const fields = filledConfigFields(item.fields);
  const hasPersonality = item.kind === "config" && fields.length > 0;
  const exportPersonality = (action: "copy" | "download") => {
    let content: string;
    try { content = toPersonalityJson(item); }
    catch (cause) { notify(cause instanceof Error ? cause.message : "人设内容无法导出。"); return; }
    if (action === "copy") void copy(content, "MaiBot JSON");
    else download(content, "maibot-personality.json", "application/json;charset=utf-8");
  };
  const files = templateFilesFor(item);
  return <WindowDialog title="作品详情" subtitle="PROMPT / VIEW" onClose={onClose}>
    <div className="detail-heading"><div className="detail-heading-icon"><BookOpenText size={22}/></div><div><span className="micro-label">{item.kind === "template" ? "Prompt 管理" : "人格与聊天配置"}{item.kind === "template" && item.category ? ` / ${item.category}` : ""}{item.sample ? " / 示例" : ""}</span><h2>{promptTitle(item)}</h2>{item.description && <p>{item.description}</p>}</div></div>
    <div className="detail-meta"><span>作者：<AccountName name={item.author} tag={item.authorTag} profileTag={item.authorProfileTag}/></span><span>支持版本（作者声明）：{formatVersionRange(item)}</span>{item.tags.map(tag => onTag ? <button key={tag} className="detail-tag" onClick={() => onTag(tag)}>#{tag}</button> : <span key={tag}>#{tag}</span>)}</div>
    {item.kind === "template" ? <div className="fields template-detail-files">{files.length > 1 && <p className="template-files-hint">共 {files.length} 个文件，点击文件名展开正文，也可直接复制或下载。</p>}{files.map((file, index) => <DetailField key={index} title={file.name ? `${file.name}.prompt` : files.length > 1 ? `提示词文件 ${index + 1}` : "Prompt 模板"} caption={[getTemplate(file.name)?.label, file.locale].filter(Boolean).join(" / ")} filename initiallyExpanded={files.length === 1} onCopy={() => copy(file.content, file.name || "模板")} onDownload={() => download(file.content, templateDownloadName(file, index))}><p className="field-screen">{file.content}</p></DetailField>)}</div> : <div className="fields">{fields.map(key => {
      const value = item.fields[key];
      const text = Array.isArray(value) ? value.join("\n") : String(value);
      return <DetailField key={key} title={fieldLabels[key]} caption={fieldPaths[key]} onCopy={() => copy(text, fieldLabels[key])}><p className="field-screen">{text}</p></DetailField>;
    })}</div>}
    <div className="dialog-actions">{item.kind === "template" ? files.length === 1 && <><button className="key hot-key" onClick={() => copy(files[0].content, "模板")}><Copy size={15}/>复制模板</button><button className="key" onClick={() => download(files[0].content, templateDownloadName(files[0], 0))}><Download size={15}/>下载 .prompt</button></> : hasPersonality && <><button className="key hot-key" onClick={() => exportPersonality("copy")}><Copy size={15}/>复制 MaiBot JSON</button><button className="key" onClick={() => exportPersonality("download")}><Download size={15}/>下载 .json</button></>}<button className="key" onClick={share}><ArrowUpRight size={15}/>复制链接</button>{item.mine && <button className="key" onClick={() => onEdit(item)}><Pencil size={15}/>编辑</button>}{item.mine && <button className="key danger-key" onClick={() => onDelete(item)}><Trash2 size={15}/>删除</button>}</div>
    <div className="card-stats usage-summary" aria-label="作品使用统计"><UsageStats stats={stats}/></div>
    <CommunityPanel focusCommentId={focusCommentId} onLocated={onLocated} itemId={item.id} signedIn={signedIn} onLogin={onLogin} onStats={onStats}/>
  </WindowDialog>;
}

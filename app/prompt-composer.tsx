"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ArrowRight, FileUp, Plus, Trash2 } from "lucide-react";
import { WindowDialog } from "@/components/retro";
import { RetroAutocomplete } from "@/components/retro-autocomplete";
import { TagAutocomplete } from "@/components/tag-autocomplete";
import { RetroSelect } from "@/components/retro-select";
import ConfigSourceImport from "./config-source-import";
import MultipleReplyStyleEditor from "./multiple-reply-style-editor";
import { fieldLabels, fieldPaths, locales, MAX_TEMPLATE_FILES, MAX_TEMPLATE_TOTAL_LENGTH, templateCategories, templateFilesFor, validateConfigFields, validatePrompt, type Category, type FieldName, type Kind, type PromptFields, type PromptItem, type TemplateFile, type TextFieldName } from "@/lib/prompts";
import { REQUIRED_PERSONALITY_FIELDS } from "@/lib/personality-export";
import { DEFAULT_MIN_VERSION, normalizeVersion, readVersionRange } from "@/lib/version-range.mjs";
import { templateCatalog } from "@/lib/template-catalog";
import { waitForReview, ReviewReadError, type ReviewJob } from "@/lib/moderation-client";

type DraftFile = TemplateFile & { id: string };
const draftFile = (file: TemplateFile = { name: "", locale: "", content: "" }): DraftFile => ({ ...file, name: file.name ? `${file.name}.prompt` : "", id: crypto.randomUUID() });
type Draft = { kind: Kind; title: string; description: string; category: Category; minVersion: string; maxVersion: string; tags: string; fields: PromptFields; templateFiles: DraftFile[] };
const draftFor = (kind: Kind): Draft => ({ kind, title: "", description: "", category: "", minVersion: DEFAULT_MIN_VERSION, maxVersion: "", tags: "", fields: {}, templateFiles: [draftFile()] });
const orderedFields: FieldName[] = ["personality", "behavior_style", "reply_style", "multiple_reply_style", "multiple_probability", "group_chat_prompt", "private_chat_prompts"];
const categoryOptions = [{ value: "", label: "未分类" }, ...templateCategories.map(value => ({ value, label: value }))];
const languageOptions = locales.map(value => ({ value }));

export default function PromptComposer({ initialKind, initialItem, adminEdit = false, onClose, onPublished }: { initialKind: Kind; initialItem?: PromptItem | null; adminEdit?: boolean; onClose: () => void; onPublished: (kind: Kind) => void }) {
  const editing = !!initialItem;
  const [draft, setDraft] = useState<Draft>(() => initialItem ? { kind: initialItem.kind, title: initialItem.title, description: initialItem.description, category: initialItem.category, minVersion: initialItem.minVersion, maxVersion: initialItem.maxVersion ?? "", tags: initialItem.tags.join("，"), fields: initialItem.fields, templateFiles: initialItem.kind === "template" ? templateFilesFor(initialItem).map(draftFile) : [draftFile()] } : draftFor(initialKind));
  const [submitting, setSubmitting] = useState(false);
  const [reading, setReading] = useState<string[]>([]);
  const [configImportPending, setConfigImportPending] = useState(false);
  const [error, setError] = useState("");
  const [job, setJob] = useState<ReviewJob | null>(null);
  const [pendingId, setPendingId] = useState("");
  const active = useRef<AbortController | null>(null), busy = useRef(false);
  const pendingKey = `mai-review-${initialItem?.id ?? "new"}`;
  const remember = (id: string, savedDraft: Draft) => { try { sessionStorage.setItem(pendingKey, JSON.stringify({ id, draft: savedDraft })); } catch {} };
  const forget = useCallback(() => { try { sessionStorage.removeItem(pendingKey); } catch {} setPendingId(""); setJob(null); }, [pendingKey]);
  const track = useCallback(async (id: string, kind: Kind, signal: AbortSignal) => {
    setPendingId(id);
    try {
      const finished = await waitForReview(id, signal, next => { if (!signal.aborted) setJob(next); });
      if (signal.aborted) return;
      forget();
      if (finished.state === "published") onPublished(kind);
      else setError(finished.error || "提交未完成，请检查后重试。");
    } catch (cause) {
      if (signal.aborted) return;
      if (cause instanceof ReviewReadError && cause.missing) forget();
      setError(cause instanceof Error ? cause.message : "无法读取审核进度。");
    }
  }, [forget, onPublished]);
  useEffect(() => {
    const controller = new AbortController(); active.current = controller;
    if (adminEdit) return () => controller.abort();
    try {
      const saved = JSON.parse(sessionStorage.getItem(pendingKey) || "null");
      if (saved?.id && saved.draft && Array.isArray(saved.draft.templateFiles) && ["config", "template"].includes(saved.draft.kind)) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- Restore the browser-only pending draft before resuming its existing server job.
        setDraft(saved.draft); setPendingId(saved.id); setSubmitting(true); busy.current = true;
        void track(saved.id, saved.draft.kind, controller.signal).finally(() => { if (!controller.signal.aborted) { setSubmitting(false); busy.current = false; } });
      }
    } catch {}
    return () => controller.abort();
  }, [pendingKey, adminEdit, track]);
  const templateOptions = useMemo(() => templateCatalog.templates.filter(item => !draft.category || item.group === draft.category).map(item => ({ value: `${item.name}.prompt`, label: item.label })), [draft.category]);
  const update = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft(previous => ({ ...previous, [key]: value }));
  const applyConfigFields = (changes: PromptFields) => {
    const fields = { ...draft.fields, ...changes };
    setDraft(previous => ({ ...previous, fields: { ...previous.fields, ...changes } }));
    const { error } = validateConfigFields(draft.title.trim() || "未命名作品", fields);
    setError(error === "请填写至少一个配置字段。" ? "" : error ?? "");
  };
  const setField = (key: FieldName, value: string | string[] | number | undefined) => applyConfigFields({ [key]: value });
  const setKind = (kind: Kind) => { setDraft(previous => ({ ...previous, kind, category: "" })); setError(""); };
  const setTemplateFile = (id: string, changes: Partial<TemplateFile>) => {
    const templateFiles = draft.templateFiles.map(file => file.id === id ? { ...file, ...changes } : file);
    setDraft(previous => ({ ...previous, templateFiles: previous.templateFiles.map(file => file.id === id ? { ...file, ...changes } : file) }));
    setError(templateFiles.some(file => file.content.length > 30000) ? "模板正文不能超过 30000 字符。" : templateFiles.reduce((sum, file) => sum + file.content.length, 0) > MAX_TEMPLATE_TOTAL_LENGTH ? `模板正文合计不能超过 ${MAX_TEMPLATE_TOTAL_LENGTH} 字符。` : "");
  };
  const importFile = async (id: string, file: File) => {
    setError("");
    if (!/\.prompt$/i.test(file.name)) { setError("请选择 .prompt 提示词文件。"); return; }
    if (file.size > 120000) { setError("每个提示词文件正文不能超过 30000 字。"); return; }
    setReading(previous => [...previous, id]);
    try {
      const content = await file.text();
      if (!content.trim() || content.length > 30000) throw new Error("每个提示词文件正文需为 1–30000 字。");
      setTemplateFile(id, { name: file.name, content });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "文件读取失败，请重试。"); }
    finally { setReading(previous => previous.filter(value => value !== id)); }
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy.current || reading.length || configImportPending) return;
    const controller = active.current ?? new AbortController(); active.current = controller;
    busy.current = true;
    if (pendingId) {
      setSubmitting(true); setError("");
      try { await track(pendingId, draft.kind, controller.signal); }
      finally { if (!controller.signal.aborted) { setSubmitting(false); busy.current = false; } }
      return;
    }
    if (!draft.title.trim()) { setError("请填写作品名称。"); busy.current = false; return; }
    const range = readVersionRange(draft.minVersion.trim(), draft.maxVersion.trim());
    if (range.error !== undefined) { setError(range.error); busy.current = false; return; }
    const payload = { ...draft, ...range, templateFiles: draft.templateFiles.map(({ name, locale, content }) => ({ name, locale, content })), tags: draft.tags.split(/[,，]/).map(value => value.trim()).filter(Boolean), ...(initialItem ? { revision: initialItem.updatedAt ?? initialItem.createdAt } : {}) };
    const validation = validatePrompt(payload);
    if (validation.error) { setError(validation.error); busy.current = false; return; }
    setSubmitting(true); setError("");
    const submissionId = crypto.randomUUID(); if (!adminEdit) remember(submissionId, draft);
    let definitelyFailed = false;
    try {
      const response = await fetch(initialItem ? `/api/${adminEdit ? "admin/works" : "prompts"}/${encodeURIComponent(initialItem.id)}` : "/api/prompts", { method: editing ? "PATCH" : "POST", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]), headers: { "Content-Type": "application/json", "Idempotency-Key": submissionId }, body: JSON.stringify(payload) });
      const result = await response.json() as { error?: string; job?: ReviewJob };
      if (!response.ok) { definitelyFailed = response.status < 500; if (definitelyFailed && !adminEdit) forget(); throw new Error(result.error || (editing ? "保存失败，请稍后重试。" : "发布失败，请稍后重试。")); }
      if (response.status === 202 && result.job) { remember(result.job.id, draft); setJob(result.job); await track(result.job.id, draft.kind, controller.signal); return; }
      if (!adminEdit) forget();
      onPublished(draft.kind);
    } catch (cause) { if (!controller.signal.aborted) { if (!definitelyFailed && !adminEdit) setPendingId(submissionId); setError(adminEdit && !definitelyFailed ? "无法确认保存结果，请重新打开作品核对后再修改。" : cause instanceof Error ? cause.message : "连接中断，可重新打开窗口查询审核进度。"); } }
    finally { if (!controller.signal.aborted) { setSubmitting(false); busy.current = false; } }
  };
  return <WindowDialog title={adminEdit ? "管理员编辑作品" : editing ? "编辑作品" : "发布作品"} subtitle={adminEdit ? "ADMIN / EDIT" : editing ? "EDIT / PROMPT" : "NEW / PROMPT"} onClose={onClose}>
    <form className="editor" onSubmit={submit}>
      {adminEdit && initialItem && <p className="admin-help">原作者：{initialItem.author}{initialItem.authorProfileTag ? ` #${initialItem.authorProfileTag}` : ""}。保存后立即生效，保留原作者并记录管理操作。</p>}
      <fieldset disabled={submitting || !!pendingId} style={{ border: 0, margin: 0, padding: 0, minWidth: 0, display: "grid", gap: 14 }}>
      {editing ? <div className="editor-kind-label">{draft.kind === "config" ? "人格与聊天配置" : "Prompt 管理"}</div> : <div className="editor-kind" role="group" aria-label="作品类型"><button type="button" className={`key ${draft.kind === "config" ? "active-key" : ""}`} onClick={() => setKind("config")} aria-pressed={draft.kind === "config"}>人格与聊天配置</button><button type="button" className={`key ${draft.kind === "template" ? "active-key" : ""}`} onClick={() => setKind("template")} aria-pressed={draft.kind === "template"}>Prompt 管理</button></div>}
      <div className="editor-section-title"><span>BASIC INFO</span><strong>基本信息</strong></div>
      <label>作品名称<input value={draft.title} maxLength={60} onChange={event => update("title", event.target.value)} placeholder="请输入作品名称" required/></label>
      <label>简介 <small>选填</small><textarea value={draft.description} maxLength={240} onChange={event => update("description", event.target.value)} placeholder="简短介绍，如使用场景，推荐模型等" rows={2}/></label>
      {draft.kind === "template" && <RetroSelect label="分类" value={draft.category} onChange={value => update("category", value as Category)} options={categoryOptions}/>}
      <div className="form-grid version-range-editor"><label><span>最低版本</span><input value={draft.minVersion} maxLength={40} onChange={event => update("minVersion", event.target.value)} onBlur={() => update("minVersion", normalizeVersion(draft.minVersion) ?? draft.minVersion)} placeholder="1.0.0" aria-label="最低版本"/></label><label><span>最高版本 <small>留空为最新</small></span><input value={draft.maxVersion} maxLength={40} onChange={event => update("maxVersion", event.target.value)} onBlur={() => update("maxVersion", draft.maxVersion.trim() === "最新" ? "" : normalizeVersion(draft.maxVersion) ?? draft.maxVersion)} placeholder="最新" aria-label="最高版本"/></label></div>
      <label>标签 <small>逗号分隔，最多 5 个</small><TagAutocomplete mode="publish" value={draft.tags} onChange={value => update("tags", value)} kind={draft.kind} label="作品标签" placeholder="例如：日常，温柔"/></label>
      <div className="editor-section-title"><span>{draft.kind === "config" ? "CONFIG FIELDS" : "PROMPT TEMPLATE"}</span><strong>{draft.kind === "config" ? "配置内容" : "模板内容"}</strong>{draft.kind === "config" && <small>人格设定、行为风格、表达风格必填</small>}</div>
      {draft.kind === "config" && <ConfigSourceImport fields={draft.fields} onApply={applyConfigFields} onPendingChange={setConfigImportPending}/>}
      {draft.kind === "config" ? orderedFields.map(key => key === "multiple_reply_style" ? <MultipleReplyStyleEditor key={key} value={draft.fields.multiple_reply_style} onChange={value => setField(key, value)} onLimit={setError}/> : <label key={key}>{fieldLabels[key]} <small>{fieldPaths[key]}</small>{key === "multiple_probability" ? <input type="number" min="0" max="1" step="0.05" value={draft.fields.multiple_probability ?? ""} onChange={event => setField(key, event.target.value === "" ? undefined : Number(event.target.value))} placeholder="0–1，选填"/> : <textarea value={draft.fields[key as TextFieldName] ?? ""} onChange={event => setField(key, event.target.value)} rows={3} required={REQUIRED_PERSONALITY_FIELDS.some(required => required === key)} placeholder={REQUIRED_PERSONALITY_FIELDS.some(required => required === key) ? "必填" : "选填"}/>}</label>) : <div className="template-files-editor">
        <p className="template-files-hint">点击「+」添加后续文件，也可直接粘贴正文。</p>
        {draft.templateFiles.map((file, index) => <section className="template-file-editor" aria-label={`提示词文件 ${index + 1}`} key={file.id}>
          <div className="template-file-heading"><strong>提示词文件 {index + 1}</strong><div>
            <label className="key small-key template-upload"><FileUp size={14}/>{reading.includes(file.id) ? "读取中…" : "选择 .prompt 文件"}<input type="file" accept=".prompt" aria-label={`上传提示词文件 ${index + 1}`} disabled={submitting || reading.includes(file.id)} onChange={event => { const selected = event.target.files?.[0]; event.target.value = ""; if (selected) void importFile(file.id, selected); }}/></label>
            {draft.templateFiles.length > 1 && <button type="button" className="key icon-key small-key danger-key" disabled={submitting || reading.includes(file.id)} aria-label={`移除提示词文件 ${index + 1}`} onClick={() => update("templateFiles", draft.templateFiles.filter(value => value.id !== file.id))}><Trash2 size={14}/></button>}
          </div></div>
          <div className="form-grid"><RetroAutocomplete label="模板文件名" value={file.name} maxLength={87} onChange={value => setTemplateFile(file.id, { name: value })} options={templateOptions} placeholder="例如：maisaka_replyer.prompt"/><RetroAutocomplete label="语言代码" value={file.locale} maxLength={24} onChange={value => setTemplateFile(file.id, { locale: value })} options={languageOptions} placeholder="例如：zh-CN"/></div>
          <label>模板正文<textarea className="template-editor" value={file.content} disabled={reading.includes(file.id)} onChange={event => setTemplateFile(file.id, { content: event.target.value })} rows={10} placeholder="上传文件或粘贴完整 .prompt 模板"/></label>
        </section>)}
        <button type="button" className="key template-add-key" disabled={submitting || draft.templateFiles.length >= MAX_TEMPLATE_FILES} onClick={() => setDraft(previous => previous.templateFiles.length < MAX_TEMPLATE_FILES ? { ...previous, templateFiles: [...previous.templateFiles, draftFile()] } : previous)}><Plus size={17}/>添加提示词文件 <small>{draft.templateFiles.length} / {MAX_TEMPLATE_FILES}</small></button>
      </div>}
      </fieldset>
      {error && <p className="form-error" role="alert">{error}</p>}
      <p className="admin-help" role={submitting || pendingId ? "status" : undefined}>{adminEdit ? submitting ? "正在保存管理员修改…" : "本次修改由管理员人工确认，保存时不进入 AI 审核队列。" : job ? `${job.state === "queued" ? `排队中，前方还有 ${job.ahead} 项` : "正在审核"}。本次最晚于 ${new Date(job.deadlineMs).toLocaleTimeString("zh-CN")} 完成。可以关闭窗口，重新打开后继续查看。` : submitting ? "正在提交审核队列…" : "发布前将使用 AI 审核标题、简介和全部提示词内容。"}</p>
      <div className="dialog-actions"><button type="button" className="key" onClick={onClose}>{pendingId || job ? "后台等待" : "取消"}</button><button className="key hot-key" disabled={submitting || reading.length > 0 || configImportPending}>{submitting ? adminEdit ? "保存中…" : "等待审核…" : pendingId ? "重新查询进度" : adminEdit ? "保存管理员修改" : (editing ? "保存修改" : "确认发布")}<ArrowRight size={15}/></button></div>
    </form>
  </WindowDialog>;
}

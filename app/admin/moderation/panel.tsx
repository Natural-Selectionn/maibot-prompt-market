"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, Plus, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { ThemeToggle } from "@/components/theme";
import { Led } from "@/components/retro";
import { RetroSelect } from "@/components/retro-select";
import { announcementDate } from "@/app/announcement-board";
import { RetryCountdown } from "@/components/retry-countdown";

type Provider = { id: string; name: string; format: "chat_completions" | "responses"; endpoint: string; model: string; enabled: boolean; hasApiKey: boolean; apiKey?: string; concurrency: number; rateLimit: number; priority: number; disableThinking?: boolean; reasoningEffort?: "default" | "low" | "medium" | "high" };
type Settings = { enabled: boolean; timeoutMs: number; budgetMs: number; instructions: string; maxAttempts: number; providers: Provider[]; revision: string; encryptionReady: boolean };
type ProviderStatus = { running: number; lastMinute: number; samples: number; averageMs: number | null; failureRate: number | null; cooldownUntilMs: number };
type ReviewEvent = { workId: string; operation: string; status: string; category: string; providerId: string; attempts: number; cause: string; createdAt: string };
type LiveStatus = { events: ReviewEvent[]; hasMore: boolean; offset: number; queue: { queued: number; running: number }; providers: Record<string, ProviderStatus> };
const statusLabels: Record<string, string> = { approved: "通过", uncertain: "存疑放行", rejected: "拒绝", skipped: "跳过审核" };
const causeLabels: Record<string, string> = { disabled: "审核已关闭", unconfigured: "无可用供应商", unavailable: "调用失败", reviewed: "完成审核", queue_timeout: "到达总等待上限" };
const categories: Record<string, string> = { none: "—", gore: "血腥", shock: "猎奇", politics: "政治", not_prompt: "非提示词" };
const formats = [{ value: "chat_completions", label: "OpenAI Chat Completions" }, { value: "responses", label: "OpenAI Responses" }];

export default function ModerationPanel() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [events, setEvents] = useState<ReviewEvent[]>([]);
  const [offset, setOffset] = useState(0), [hasMore, setHasMore] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [queue, setQueue] = useState({ queued: 0, running: 0 });
  const [providerStatus, setProviderStatus] = useState<Record<string, ProviderStatus>>({});
  const [liveError, setLiveError] = useState(false);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/admin/moderation", { signal: controller.signal, cache: "no-store" }).then(async response => {
      const data = await response.json() as { error?: string; settings: Settings };
      if (!response.ok) throw new Error(data.error ?? "读取失败。");
      if (!controller.signal.aborted) setSettings(data.settings);
    }).catch(cause => { if (cause.name !== "AbortError") setError(cause.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [reload]);
  const canReadHistory = settings !== null;
  useEffect(() => {
    if (!canReadHistory) return;
    const controller = new AbortController(); let pending = false;
    const refresh = async () => {
      if (pending) return; pending = true;
      try {
        const response = await fetch(`/api/admin/moderation?live=1&offset=${offset}`, { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]) });
        if (!response.ok) throw new Error("unavailable");
        const data = await response.json() as LiveStatus;
        if (!controller.signal.aborted) { setEvents(data.events); setHasMore(data.hasMore); setQueue(data.queue); setProviderStatus(data.providers); setLiveError(false); }
      } catch { if (!controller.signal.aborted) setLiveError(true); }
      finally { pending = false; if (!controller.signal.aborted) setHistoryLoading(false); }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 5000);
    return () => { clearInterval(timer); controller.abort(); };
  }, [offset, reload, canReadHistory]);
  const beginHistory = () => { setHistoryLoading(true); setEvents([]); setHasMore(false); setLiveError(false); };
  const reloadSettings = () => { setLoading(true); setError(""); beginHistory(); setReload(value => value + 1); };
  const changePage = (next: number) => { if (next !== offset) { beginHistory(); setOffset(next); } };
  const patch = (changes: Partial<Settings>) => setSettings(previous => previous ? { ...previous, ...changes } : previous);
  const update = (id: string, changes: Partial<Provider>) => setSettings(previous => previous ? { ...previous, providers: previous.providers.map(provider => provider.id === id ? { ...provider, ...changes } : provider) } : previous);
  const move = (index: number, direction: number) => {
    if (!settings) return;
    const providers = [...settings.providers];
    [providers[index], providers[index + direction]] = [providers[index + direction], providers[index]];
    patch({ providers: providers.map((provider, position) => ({ ...provider, priority: position + 1 })) });
  };
  const save = async (event: FormEvent) => {
    event.preventDefault(); if (!settings || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const { encryptionReady: _ready, providers, ...rest } = settings;
      const response = await fetch("/api/admin/moderation", { method: "PUT", cache: "no-store", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...rest, providers: providers.map(({ hasApiKey: _hasKey, ...provider }) => provider) }) });
      const data = await response.json() as { error?: string; settings: Settings };
      if (!response.ok) throw new Error(data.error ?? "保存失败。");
      setSettings(data.settings); setNotice("审核设置已保存。");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "保存失败。"); }
    finally { setBusy(false); }
  };
  return <div className="desktop"><div className="app-window admin-window">
    <header className="titlebar"><div className="brand"><Led/><span className="nameplate">MAI / ADMIN</span><span className="brand-cn">AI 审核</span></div><div className="title-actions"><ThemeToggle/><a className="key" href="/admin"><ArrowLeft size={14}/>管理面板</a></div></header>
    <main className="workspace admin-workspace moderation-workspace">
      <div className="workspace-heading"><div><div className="kicker">PRE-PUBLISH REVIEW</div><h1>发布前 AI 审核</h1></div><span className="admin-badge"><ShieldCheck size={16}/>主管理员 #0002</span></div>
      {error && <p className="form-error" role="alert">{error}</p>}{notice && <p className="admin-notice" role="status">{notice}</p>}
      {loading ? <p role="status">正在读取审核设置…</p> : !settings ? <button className="key" onClick={reloadSettings}>重新读取</button> : <>
        {!settings.encryptionReady && <p className="form-error" role="alert">服务器尚未配置密钥加密，暂时无法保存新的 API Key。</p>}
        <form className="moderation-form" onSubmit={save}><fieldset disabled={busy}>
          <div className="moderation-options"><label className="moderation-check"><input type="checkbox" checked={settings.enabled} onChange={event => patch({ enabled: event.target.checked })}/>启用发布前审核</label>
            <label>每家最多等待（秒）<input type="number" min={1} max={600} required value={settings.timeoutMs / 1000} onChange={event => patch({ timeoutMs: Number(event.target.value) * 1000 })}/></label>
            <label>总等待上限（分钟，含排队）<input type="number" min={0.1} max={60} step={0.1} required value={settings.budgetMs / 60000} onChange={event => patch({ budgetMs: Math.round(Number(event.target.value) * 60000) })}/></label>
            <label>每家最多尝试次数<input type="number" min={1} max={3} required value={settings.maxAttempts} onChange={event => patch({ maxAttempts: Number(event.target.value) })}/></label></div>
          <label className="moderation-policy">审核提示词<textarea rows={14} required maxLength={20000} value={settings.instructions} onChange={event => patch({ instructions: event.target.value })}/><small>请保留 decision、category、reason 的 JSON 输出约定。拒绝类别支持 gore、shock、politics、not_prompt。</small></label>
          <div className="moderation-providers">{settings.providers.map((provider, index) => <section className="moderation-provider" key={provider.id} aria-label={`供应商 ${index + 1}`}>
            <div className="moderation-provider-heading"><h2>供应商 {index + 1}</h2><div className="admin-actions"><button type="button" className="key" aria-label={`上移供应商 ${index + 1}`} disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp size={14}/></button><button type="button" className="key" aria-label={`下移供应商 ${index + 1}`} disabled={index === settings.providers.length - 1} onClick={() => move(index, 1)}><ArrowDown size={14}/></button><button type="button" className="key admin-danger" aria-label={`移除供应商 ${index + 1}`} onClick={() => patch({ providers: settings.providers.filter(value => value.id !== provider.id) })}><Trash2 size={14}/></button></div></div>
            <div className="moderation-grid"><label>名称<input required maxLength={60} value={provider.name} onChange={event => update(provider.id, { name: event.target.value })}/></label>
              <RetroSelect label="接口格式" value={provider.format} options={formats} onChange={value => update(provider.id, { format: value as Provider["format"] })}/>
              <label className="moderation-wide">API 端点<input type="url" required maxLength={500} placeholder="https://api.example.com/v1" autoComplete="off" value={provider.endpoint} onChange={event => update(provider.id, { endpoint: event.target.value })}/><small>可填写基础地址或完整的 /chat/completions、/responses 地址。</small></label>
              <label>模型<input required maxLength={120} autoComplete="off" placeholder="供应商提供的模型名称" value={provider.model} onChange={event => update(provider.id, { model: event.target.value })}/></label>
              <label>API Key<input type="password" autoComplete="new-password" maxLength={4096} value={provider.apiKey ?? ""} placeholder={provider.hasApiKey ? "已加密保存，留空保留" : "输入 API Key"} onChange={event => update(provider.id, { apiKey: event.target.value })}/><small>{provider.hasApiKey ? "已配置 · 更改端点时需要重新填写密钥" : "尚未配置密钥"}</small></label>
              <label>并发额度（条）<input type="number" min={1} max={10} required value={provider.concurrency} onChange={event => update(provider.id, { concurrency: Number(event.target.value) })}/></label>
              <label>限流额度（次 / 分钟，0 不限）<input type="number" min={0} max={6000} required value={provider.rateLimit} onChange={event => update(provider.id, { rateLimit: Number(event.target.value) })}/></label>
              <label>优先级（小优先）<input type="number" min={1} max={100} required value={provider.priority} onChange={event => update(provider.id, { priority: Number(event.target.value) })}/></label></div>
            <div className="moderation-provider-stats" aria-label={`${provider.name} 运行状态`}>
              <span>正在审核数<strong>{providerStatus[provider.id]?.running ?? 0} 条</strong></span>
              <span>近 60 秒<strong>{providerStatus[provider.id]?.lastMinute ?? 0} 次审核</strong></span>
              <span>平均耗时 · 近 1 小时<strong>{providerStatus[provider.id]?.averageMs == null ? "—" : `${(providerStatus[provider.id].averageMs! / 1000).toFixed(1)} 秒`}</strong></span>
              <span>调用失败率 · 近 1 小时<strong>{providerStatus[provider.id]?.failureRate == null ? "—" : `${(providerStatus[provider.id].failureRate! * 100).toFixed(1)}%`}</strong></span>
              {providerStatus[provider.id]?.cooldownUntilMs > 0 && <RetryCountdown key={providerStatus[provider.id].cooldownUntilMs} untilMs={providerStatus[provider.id].cooldownUntilMs}/>}
            </div>
            <label className="moderation-check"><input type="checkbox" checked={provider.enabled} onChange={event => update(provider.id, { enabled: event.target.checked })}/>启用此供应商</label>
            {provider.format === "chat_completions" && <><label className="moderation-check"><input type="checkbox" checked={provider.disableThinking ?? false} onChange={event => update(provider.id, { disableThinking: event.target.checked })}/>关闭模型思考（支持此参数的模型）</label>
              {!provider.disableThinking && <RetroSelect label="思考强度（需模型支持）" value={provider.reasoningEffort ?? "default"} options={[{ value: "default", label: "模型默认" }, { value: "low", label: "低" }, { value: "medium", label: "中" }, { value: "high", label: "高" }]} onChange={value => update(provider.id, { reasoningEffort: value as Provider["reasoningEffort"] })}/>}</>}
          </section>)}</div>
          {liveError && <p className="form-error" role="status">运行状态暂时无法更新，当前显示的是上次成功读取的数据。</p>}
          {!settings.providers.length && <p className="moderation-empty">尚未配置供应商，发布将直接放行。</p>}
          <div className="dialog-actions"><button type="button" className="key" disabled={settings.providers.length >= 5} onClick={() => patch({ providers: [...settings.providers, { id: crypto.randomUUID(), name: `供应商 ${settings.providers.length + 1}`, format: "chat_completions", endpoint: "", model: "", enabled: true, hasApiKey: false, concurrency: 1, rateLimit: 0, priority: settings.providers.length + 1 }] })}><Plus size={15}/>添加供应商</button><button className="key hot-key">{busy ? "保存中…" : "保存审核设置"}</button></div>
        </fieldset></form>
        <div className="moderation-history-heading"><h2>审核队列与记录</h2><button className="key" disabled={busy || historyLoading} onClick={reloadSettings}><RefreshCw size={14}/>重新载入</button></div><p className="admin-help" role="status">排队 {queue.queued} 条 · 正在审核 {queue.running} 条。任务按提交顺序分配空闲供应商。</p>
        <div className="admin-table-wrap" aria-busy={historyLoading}><table className="admin-table"><thead><tr><th>时间 / 操作</th><th>结果</th><th>类别 / 原因</th><th>供应商 / 尝试</th></tr></thead><tbody>{historyLoading ? <tr><td colSpan={4} role="status">正在读取审核记录…</td></tr> : events.length ? events.map((item, index) => <tr key={`${item.createdAt}-${index}`}><td>{announcementDate(item.createdAt)}<small>{item.operation === "update" ? "编辑作品" : "发布作品"}</small></td><td>{statusLabels[item.status] ?? item.status}</td><td>{categories[item.category] ?? "—"}<small>{causeLabels[item.cause] ?? item.cause}</small></td><td>{settings.providers.find(provider => provider.id === item.providerId)?.name ?? "—"}<small>{item.attempts} 次</small></td></tr>) : <tr><td colSpan={4}>{liveError ? "读取审核记录失败，请重新载入。" : offset ? "本页暂无审核记录。" : "暂无审核记录。"}</td></tr>}</tbody></table></div>
        <nav className="admin-pagination" aria-label="审核记录分页"><button className="key" disabled={busy || historyLoading || offset === 0} onClick={() => changePage(Math.max(0, offset - 20))}>上一页</button><span aria-live="polite">第 {offset / 20 + 1} 页 · 每页 20 条</span><button className="key" disabled={busy || historyLoading || !hasMore} onClick={() => changePage(offset + 20)}>下一页</button></nav>
      </>}
      <div className="statusbar"><span><Led/>AI 审核管理</span><span>MAIBOT COMMUNITY</span><Link href="/" prefetch={false}>返回网站</Link></div>
    </main></div></div>;
}

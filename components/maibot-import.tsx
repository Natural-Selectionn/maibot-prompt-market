"use client";

import { useId, useState } from "react";
import { ArrowUpRight, Copy, Download } from "lucide-react";
import { useMaibot } from "@/components/maibot-bridge";
import { MAIBOT_ADDRESS_ERROR, maibotImportUrl } from "@/lib/maibot-bridge";
import { toPersonalityJson } from "@/lib/personality-export";
import type { PromptItem } from "@/lib/prompts";
import styles from "./maibot-import.module.css";

export function MaibotImport({ item, notify, onCopy, onDownload, onShare }: { item: Pick<PromptItem, "title" | "fields">; notify: (message: string) => void; onCopy: () => void; onDownload: () => void; onShare: () => void }) {
  const { fromWebui, origin, setOrigin } = useMaibot();
  const [editing, setEditing] = useState(false);
  const [attemptedOrigin, setAttemptedOrigin] = useState<string>();
  const [address, setAddress] = useState("");
  const [error, setError] = useState("");
  const inputId = useId();
  if (!fromWebui) return null;
  let href: string | undefined;
  let exportError = "";
  if (origin) {
    try { href = maibotImportUrl(origin, toPersonalityJson(item)); }
    catch (cause) { exportError = cause instanceof Error ? cause.message : "人设内容无法导出。"; }
  }
  const edit = () => { setAddress(origin ?? ""); setError(""); setEditing(true); };

  return <div className={styles.panel}>
    <div className={styles.toolbar} role="group" aria-label="人设操作">
      <a className="key hot-key" href={href} role={href ? undefined : "button"} tabIndex={0} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" onClick={event => {
        if (!origin || !href) {
          event.preventDefault();
          if (!origin) edit();
          else notify(exportError);
        } else setAttemptedOrigin(origin);
      }} onKeyDown={event => { if (!href && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); event.currentTarget.click(); } }}><ArrowUpRight size={15}/>导入到 MaiBot</a>
      <button type="button" className="key" onClick={onCopy}><Copy size={15}/>复制 JSON</button>
      <button type="button" className="key" onClick={onDownload}><Download size={15}/>下载 JSON</button>
      <button type="button" className={`key ${styles.share}`} onClick={onShare}><ArrowUpRight size={15}/>复制链接</button>
    </div>
    <p className={styles.hint}>{origin ? <>您会跳转到MaiBot WebUI继续，检测到地址：<bdi>{origin}</bdi></> : "您会跳转到MaiBot WebUI继续，未检测到有效地址"}{!editing && origin && attemptedOrigin === origin && <button type="button" className={styles.recovery} onClick={edit}>未能打开？</button>}</p>
    {editing && <form className={styles.editor} onSubmit={event => {
      event.preventDefault();
      try { setOrigin(address); setEditing(false); setError(""); setAttemptedOrigin(undefined); }
      catch { setError(MAIBOT_ADDRESS_ERROR); }
    }}>
      <p role="status">请确认或填写 WebUI 地址后重试。</p>
      <label htmlFor={inputId}>MaiBot WebUI 地址</label>
      <input id={inputId} type="text" inputMode="url" autoComplete="off" spellCheck={false} value={address} placeholder="http://127.0.0.1:8001" aria-invalid={!!error} aria-describedby={error ? `${inputId}-error` : undefined} onChange={event => setAddress(event.target.value)} autoFocus/>
      {error && <p id={`${inputId}-error`} role="alert">{error}</p>}
      <div className={styles.row}><button type="submit" className="key small-key">保存地址</button><button type="button" className="key small-key" onClick={() => setEditing(false)}>取消</button>{origin && <button type="button" className="key small-key" onClick={() => { setOrigin(null); setEditing(false); }}>清除地址</button>}</div>
    </form>}
  </div>;
}

"use client";

import { useEffect, useRef, useState } from "react";
import { FileUp } from "lucide-react";
import { readConfigSource } from "@/lib/config-source";
import { fieldLabels, fieldPaths, filledConfigFields, type FieldName, type PromptFields } from "@/lib/prompts";
import styles from "./config-source-import.module.css";

type Preview = { name: string; fields: PromptFields; selected: FieldName[] };

export default function ConfigSourceImport({ fields, onApply, onPendingChange }: { fields: PromptFields; onApply: (fields: PromptFields) => void; onPendingChange: (pending: boolean) => void }) {
  const [reading, setReading] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const request = useRef(0);
  useEffect(() => () => { request.current++; onPendingChange(false); }, [onPendingChange]);

  const choose = async (file: File) => {
    const id = ++request.current;
    setReading(true); setPreview(null); setError(""); setStatus(""); onPendingChange(true);
    try {
      const parsed = await readConfigSource(file);
      if (id !== request.current) return;
      setPreview({ name: file.name, fields: parsed, selected: filledConfigFields(parsed) });
    } catch (cause) {
      if (id !== request.current) return;
      setError(cause instanceof Error ? cause.message : "文件读取失败，请重试。"); onPendingChange(false);
    } finally {
      if (id === request.current) setReading(false);
    }
  };
  const cancel = () => { setPreview(null); onPendingChange(false); };
  const apply = () => {
    if (!preview?.selected.length) return;
    const chosen = Object.fromEntries(preview.selected.map(key => [key, preview.fields[key]])) as PromptFields;
    onApply(chosen);
    setStatus(`已填入 ${preview.selected.length} 个字段，可继续修改，检查后再发布。`);
    cancel();
  };

  return <section className={styles.source} aria-label="从源文件导入人设" aria-busy={reading}>
    <div className={styles.heading}><strong>从源文件导入</strong><label className={`key small-key ${styles.upload}`}><FileUp size={14}/>{reading ? "解析中…" : "选择配置文件"}<input type="file" accept=".json,.toml" aria-label="选择人设源文件" disabled={reading} onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void choose(file); }}/></label></div>
    <p className={styles.hint}>支持 bot_config.toml 和 MaiBot 人设 JSON。</p>
    {error && <p className="form-error" role="alert">{error}</p>}
    {status && <p className={styles.hint} role="status">{status}</p>}
    {preview && <div className={styles.preview}>
      <p className={styles.hint} role="status">已解析 {preview.name}，识别到 {filledConfigFields(preview.fields).length} 个字段。勾选后填入，未选字段保持原样。</p>
      {filledConfigFields(preview.fields).map(key => {
        const value = preview.fields[key];
        const current = fields[key];
        const replacing = filledConfigFields(fields).includes(key) && JSON.stringify(current) !== JSON.stringify(value);
        return <div className={styles.field} key={key}>
          <label className={styles.choice}><input type="checkbox" checked={preview.selected.includes(key)} onChange={event => setPreview(previous => previous ? { ...previous, selected: event.target.checked ? [...previous.selected, key] : previous.selected.filter(item => item !== key) } : null)}/><span>{fieldLabels[key]}<small>{fieldPaths[key]}</small></span>{replacing && <em>将替换已有内容</em>}</label>
          <div className={styles.content} role="region" aria-label={`${fieldLabels[key]}导入预览`} tabIndex={0}>
            {Array.isArray(value) ? <ol className={styles.values}>{value.map((text, index) => <li key={index}><pre>{text}</pre></li>)}</ol> : <pre>{String(value)}</pre>}
          </div>
        </div>;
      })}
      <div className={styles.actions}><button type="button" className="key small-key" onClick={cancel}>取消导入</button><button type="button" className="key small-key hot-key" disabled={!preview.selected.length} onClick={apply}>填入所选字段（{preview.selected.length}）</button></div>
    </div>}
  </section>;
}

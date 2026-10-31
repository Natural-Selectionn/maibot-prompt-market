"use client";

import { Plus, Trash2 } from "lucide-react";
import styles from "./multiple-reply-style-editor.module.css";

export default function MultipleReplyStyleEditor({ value, onChange, onLimit }: { value?: string[]; onChange: (styles: string[]) => void; onLimit?: (message: string) => void }) {
  const entries = value?.length ? value : [""];
  return <section className={styles.editor} aria-label="备用表达风格">
    <div className={styles.heading}><strong>备用表达风格</strong><small>personality.multiple_reply_style</small></div>
    <div className={styles.entries}>
      {entries.map((text, index) => <div className={styles.entry} key={index}>
        <div className={styles.entryHeading}><strong>风格 {index + 1}</strong><button type="button" className="key small-key" aria-label={`删除备用表达风格 ${index + 1}`} onClick={() => onChange(entries.filter((_, position) => position !== index))}><Trash2 size={14}/><span>删除</span></button></div>
        <textarea aria-label={`风格 ${index + 1} 内容`} value={text} rows={4} placeholder="填写这一种表达风格，选填" onChange={event => onChange(entries.map((previous, position) => position === index ? event.target.value : previous))}/>
      </div>)}
    </div>
    <button type="button" className={`key small-key ${styles.add}`} onClick={() => { if (entries.length < 10) onChange([...entries, ""]); else onLimit?.("备用表达风格最多 10 项。"); }}><Plus size={16}/>新增风格栏位</button>
  </section>;
}

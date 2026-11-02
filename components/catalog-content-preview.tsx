"use client";

import { useLayoutEffect, useRef, useState } from "react";
import styles from "./catalog-content-preview.module.css";

const dividerSpace = 13;
type PreviewSegment = { key: string; label: string; text: string };

export function ContentPreview({ segments, fallback, preserveLineBreaks = true }: { segments: PreviewSegment[]; fallback: string; preserveLineBreaks?: boolean }) {
  const entries = segments.filter(segment => segment.text.trim()).map(segment => ({ ...segment, text: segment.text.trim().slice(0, 4096) }));
  const root = useRef<HTMLSpanElement>(null);
  const measurements = useRef<HTMLSpanElement>(null);
  const [lines, setLines] = useState<number[]>([5]);
  const contentKey = JSON.stringify(entries);

  useLayoutEffect(() => {
    const element = root.current;
    const measure = measurements.current;
    if (!element || !measure) return;
    const fit = () => {
      const style = getComputedStyle(element);
      const lineHeight = parseFloat(style.lineHeight);
      let remaining = Math.min(8 * lineHeight, element.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom));
      const next: number[] = [];
      for (const child of measure.children) {
        const separator = next.length ? dividerSpace : 0;
        const available = Math.floor((remaining - separator + 0.1) / lineHeight);
        if (available < 1) break;
        const natural = Math.max(1, Math.ceil(child.getBoundingClientRect().height / lineHeight - 0.01));
        const visible = Math.min(natural, available);
        next.push(visible);
        remaining -= separator + visible * lineHeight;
        if (visible < natural) break;
      }
      setLines(previous => previous.length === next.length && previous.every((value, index) => value === next[index]) ? previous : next);
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    observer.observe(measure);
    return () => observer.disconnect();
  }, [contentKey]);

  if (!entries.length) return <span className="card-preview"><span className="card-preview-text">{fallback || "配置片段"}</span></span>;
  return <span ref={root} className={`card-preview ${styles.preview}`} style={{ whiteSpace: preserveLineBreaks ? "pre-wrap" : "normal" }}>
    <span className={styles.content}>
      {entries.map(({ key, label, text }, index) => lines[index] ? <span key={key} className={styles.segment} aria-label={label} title={label} style={{ WebkitLineClamp: lines[index] }}>{text}</span> : null)}
    </span>
    <span ref={measurements} className={styles.measurements} aria-hidden="true">
      {entries.map(({ key, text }) => <span key={key}>{text}</span>)}
    </span>
  </span>;
}

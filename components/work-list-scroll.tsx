"use client";

import { useEffect, useRef, type ReactNode } from "react";
import styles from "./work-list-scroll.module.css";

export function WorkListScroll({ label, resetKey, children }: { label: string; resetKey: string; children: ReactNode }) {
  const viewport = useRef<HTMLDivElement>(null);
  useEffect(() => { viewport.current?.scrollTo({ top: 0, behavior: "instant" }); }, [resetKey]);
  return <div ref={viewport} className={styles.viewport} role="region" aria-label={label} tabIndex={0}>{children}</div>;
}

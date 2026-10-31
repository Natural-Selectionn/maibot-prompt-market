"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

export function Led({ label }: { label?: string }) {
  return <span className="led-label"><i aria-hidden="true"/>{label && <span>{label}</span>}</span>;
}

export function WindowDialog({ title, subtitle, onClose, children }: { title: string; subtitle: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const nestedPopup = event.target instanceof Element && event.target.closest('[role="combobox"][aria-expanded="true"], [role="listbox"]');
      if (event.key === "Escape" && !event.defaultPrevented && !nestedPopup) onClose();
    };
    document.addEventListener("keydown", handler);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", handler); document.body.style.overflow = previous; };
  }, [onClose]);
  return <div className="dialog-overlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="dialog-window" role="dialog" aria-modal="true" aria-labelledby="dialog-heading">
      <div className="dialog-titlebar"><div><Led/><strong id="dialog-heading">{title}</strong><span>{subtitle}</span></div><button className="key icon-key" onClick={onClose} aria-label="关闭"><X size={15}/></button></div>
      <div className="dialog-content">{children}</div>
    </section>
  </div>;
}

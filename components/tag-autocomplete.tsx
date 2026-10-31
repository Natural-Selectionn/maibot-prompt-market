"use client";

import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { completeTag, parseSearch, tagCompletion } from "@/lib/search";
import type { Kind } from "@/lib/prompts";

type Tag = { tag: string; count: number };
type Props = { mode: "search" | "publish"; value: string; onChange: (value: string) => void; kind: Kind; label: string; placeholder?: string; maxLength?: number };

export function TagAutocomplete({ mode, value, onChange, kind, label, placeholder, maxLength = 240 }: Props) {
  const id = useId(), input = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false), [composing, setComposing] = useState(false), [dismissed, setDismissed] = useState(false);
  const [caret, setCaret] = useState(value.length);
  const [response, setResponse] = useState<{ request: object; tags: Tag[] } | null>(null);
  const [selection, setSelection] = useState<{ request: object; index: number } | null>(null);
  const [position, setPosition] = useState<CSSProperties>({ visibility: "hidden" });
  const target = useMemo(() => tagCompletion(value, Math.min(caret, value.length), mode), [value, caret, mode]);
  const query = target?.query ?? "";
  const remaining = target ? value.slice(0, target.start) + (mode === "search" ? " " : "，") + value.slice(target.end) : value;
  const selected = mode === "search" ? parseSearch(remaining).tags : remaining.split(/[,，]/u).map(tag => tag.trim()).filter(Boolean);
  const eligible = focused && !composing && !dismissed && !!target && query.trim().length > 0 && query.length <= 12;
  const request = useMemo(() => ({ eligible, query, kind }), [eligible, query, kind]);
  const results = response?.request === request ? response.tags : [];
  const active = selection?.request === request ? selection.index : -1;
  const setActive = (next: number | ((previous: number) => number)) => setSelection(previous => ({
    request, index: typeof next === "function" ? next(previous?.request === request ? previous.index : -1) : next,
  }));
  const choices = selected.length >= 5 ? [] : results.filter(item => !selected.some(tag => tag.toLowerCase() === item.tag.toLowerCase())).slice(0, 8);
  const open = eligible && choices.length > 0;

  useEffect(() => {
    if (!request.eligible) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ q: request.query, kind: request.kind });
      fetch(`/api/tags?${params}`, { signal: controller.signal }).then(async response => {
        if (!response.ok) return;
        const data = await response.json() as { tags?: Tag[] };
        if (!controller.signal.aborted) setResponse({ request, tags: data.tags ?? [] });
      }).catch(() => { /* Free input remains available if suggestions fail. */ });
    }, 180);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [request]);

  useEffect(() => {
    if (!open) return;
    const anchor = mode === "search" ? input.current?.closest(".search-screen") : input.current;
    const locate = () => {
      const rect = anchor?.getBoundingClientRect();
      if (!rect) return;
      const viewport = window.visualViewport;
      const top = viewport?.offsetTop ?? 0;
      const bottom = top + (viewport?.height ?? window.innerHeight);
      if (rect.top >= bottom || rect.bottom <= top) { setPosition({ visibility: "hidden" }); return; }
      const left = (viewport?.offsetLeft ?? 0) + 8;
      const availableWidth = (viewport?.width ?? window.innerWidth) - 16;
      const width = Math.min(rect.width, availableWidth);
      const below = Math.max(0, bottom - rect.bottom - 13), above = Math.max(0, rect.top - top - 13);
      const flip = below < Math.min(180, choices.length * 36 + 12) && above > below;
      const maxHeight = Math.min(240, (viewport?.height ?? window.innerHeight) * .45, flip ? above : below);
      setPosition({ left: Math.max(left, Math.min(rect.left, left + availableWidth - width)), top: flip ? undefined : rect.bottom + 5, bottom: flip ? window.innerHeight - rect.top + 5 : undefined, width, maxHeight, visibility: "visible" });
    };
    const observer = new ResizeObserver(locate);
    if (anchor) observer.observe(anchor);
    locate(); window.addEventListener("resize", locate); window.addEventListener("scroll", locate, true); window.visualViewport?.addEventListener("resize", locate);
    return () => { observer.disconnect(); window.removeEventListener("resize", locate); window.removeEventListener("scroll", locate, true); window.visualViewport?.removeEventListener("resize", locate); };
  }, [open, choices.length, mode]);
  useEffect(() => { if (active >= 0) document.getElementById(`${id}-${active}`)?.scrollIntoView({ block: "nearest" }); }, [active, id]);

  const choose = (tag: string) => {
    if (!target || input.current?.matches(":disabled")) return;
    const next = completeTag(value, target, tag, mode);
    onChange(next.value); setCaret(next.caret); setDismissed(true); setActive(-1);
    requestAnimationFrame(() => { input.current?.focus(); input.current?.setSelectionRange(next.caret, next.caret); });
  };
  return <span className={`tag-autocomplete tag-autocomplete-${mode}`}>
    <input ref={input} value={value} maxLength={maxLength} aria-label={label} placeholder={placeholder} autoComplete="off"
      role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={open ? `${id}-list` : undefined} aria-activedescendant={open && active >= 0 && active < choices.length ? `${id}-${active}` : undefined}
      onChange={event => { onChange(event.target.value); setCaret(event.target.selectionStart ?? event.target.value.length); setDismissed(false); setActive(-1); }}
      onSelect={event => setCaret(event.currentTarget.selectionStart ?? value.length)}
      onFocus={event => { setFocused(true); setCaret(event.target.selectionStart ?? value.length); setDismissed(false); }} onBlur={() => { setFocused(false); setActive(-1); }}
      onCompositionStart={() => setComposing(true)} onCompositionEnd={event => { setComposing(false); setCaret(event.currentTarget.selectionStart ?? value.length); setDismissed(false); }}
      onKeyDown={event => {
        if (composing || event.nativeEvent.isComposing || event.keyCode === 229) return;
        if (event.key === "Escape" && open) { event.preventDefault(); event.stopPropagation(); setDismissed(true); return; }
        if (!open) return;
        if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setActive(previous => event.key === "ArrowDown" ? (previous + 1) % choices.length : (previous <= 0 ? choices.length - 1 : previous - 1)); }
        if (event.key === "Enter") { event.preventDefault(); choose(choices[active >= 0 && active < choices.length ? active : 0].tag); }
      }}/>
    {open && createPortal(<ul id={`${id}-list`} role="listbox" aria-label="标签建议" className="tag-completion-menu" style={position} onMouseDown={event => event.preventDefault()}>
      {choices.map((item, index) => <li key={item.tag} id={`${id}-${index}`} role="option" aria-selected={index === active} onMouseMove={() => setActive(index)} onClick={() => choose(item.tag)}><span>#{item.tag}</span><small>{item.count} 篇</small></li>)}
    </ul>, document.body)}
  </span>;
}

"use client";

import { useEffect, useState } from "react";
import type { CommunityStats, Kind, PromptItem } from "@/lib/prompts";

const PAGE_SIZE = 10;
type WorkPage = { items: PromptItem[]; stats: Record<string, CommunityStats>; hasMore: boolean; error?: string };
type Result = { key: string; data?: WorkPage; error: string };

export function useAuthorWorks({ scope, revision = 0, refresh = 0, enabled = true }: {
  scope: string; revision?: number; refresh?: number; enabled?: boolean;
}) {
  const [filter, setFilter] = useState<{ kind: Kind | ""; pageIndex: number }>({ kind: "", pageIndex: 0 });
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const { kind, pageIndex } = filter;
  const url = `/api/prompts?${scope}&kind=${kind}&offset=${pageIndex * PAGE_SIZE}&limit=${PAGE_SIZE}`;
  const key = `${url}:${revision}:${refresh}:${retry}`;

  useEffect(() => {
    // Pending-review recovery can publish a work before the owned list is read.
    if (!enabled) return;
    const controller = new AbortController();
    void fetch(url, { cache: "no-store", signal: controller.signal }).then(async response => {
      const data = await response.json() as WorkPage;
      if (!response.ok) throw new Error(data.error || "作品加载失败。");
      if (controller.signal.aborted) return;
      if (!data.items.length && pageIndex > 0) {
        // Deleting the last work on a page should return to the preceding page.
        setFilter(current => ({ ...current, pageIndex: Math.max(0, current.pageIndex - 1) }));
        return;
      }
      setResult({ key, data, error: "" });
    }).catch(cause => {
      if (!controller.signal.aborted) setResult({ key, error: cause instanceof Error ? cause.message : "作品加载失败。" });
    });
    return () => controller.abort();
  }, [url, key, pageIndex, enabled]);

  const current = result?.key === key ? result : null;
  return {
    kind, pageIndex,
    items: current?.data?.items ?? [],
    stats: current?.data?.stats ?? {},
    hasMore: current?.data?.hasMore ?? false,
    loading: !enabled || !current,
    error: current?.error ?? "",
    changeKind: (next: Kind | "") => setFilter(previous => previous.kind === next ? previous : { kind: next, pageIndex: 0 }),
    changePage: (next: number) => setFilter(previous => ({ ...previous, pageIndex: Math.max(0, next) })),
    retryLoad: () => setRetry(value => value + 1),
  };
}

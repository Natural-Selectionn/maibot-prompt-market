import { Copy, Download } from "lucide-react";
import type { CommunityStats } from "@/lib/prompts";

export function UsageStats({ stats }: { stats: CommunityStats }) {
  return <><span title="去重复制人数"><Copy size={13} aria-hidden="true"/>复制 {stats.copyCount ?? 0}</span><span title="去重下载人数"><Download size={13} aria-hidden="true"/>下载 {stats.downloadCount ?? 0}</span></>;
}

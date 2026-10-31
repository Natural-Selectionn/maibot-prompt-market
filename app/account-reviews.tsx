"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowUpRight, CheckCircle2, Clock3, RefreshCw, XCircle } from "lucide-react";
import { WindowDialog } from "@/components/retro";
import { waitForReview, type ReviewJob } from "@/lib/moderation-client";
import type { Kind } from "@/lib/prompts";
import styles from "./account-reviews.module.css";

type Submission = ReviewJob & { title: string; description: string; kind: Kind; createdMs: number };
export type PendingSummary = { count: number; loading: boolean; failed: boolean };
const active = (job: ReviewJob) => job.state === "queued" || job.state === "running";

function forgetCompletedDraft(submission: Submission) {
  try {
    const key = `mai-review-${submission.operation === "update" ? submission.workId : "new"}`;
    const saved = JSON.parse(sessionStorage.getItem(key) || "null");
    if (saved?.id === submission.id) sessionStorage.removeItem(key);
  } catch { /* The server list remains available when browser storage is disabled. */ }
}

function ReviewProgress({ submission, onClose, onFinished }: { submission: Submission; onClose: () => void; onFinished: () => void }) {
  const [job, setJob] = useState<ReviewJob>(submission);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [reading, setReading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- A newly selected/retried server job starts a fresh progress read.
    setReading(true); setError("");
    void waitForReview(submission.id, controller.signal, next => { if (!controller.signal.aborted) setJob(next); }).then(() => {
      if (!controller.signal.aborted) { forgetCompletedDraft(submission); onFinished(); }
    }).catch(cause => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "暂时无法读取审核进度。");
    }).finally(() => { if (!controller.signal.aborted) setReading(false); });
    return () => controller.abort();
  }, [submission, retry, onFinished]);
  const pending = active(job);
  const label = job.state === "queued" ? `排队中，前方还有 ${job.ahead} 项` : job.state === "running" ? "正在审核" : job.state === "published" ? "已发布" : job.state === "rejected" ? "未通过审核" : "提交未完成";
  const Icon = pending ? Clock3 : job.state === "published" ? CheckCircle2 : XCircle;
  return <WindowDialog title="审核进度" subtitle="REVIEW / PROGRESS" onClose={onClose}>
    <div className={styles.progress}>
      <h2>{submission.title || "未命名作品"}</h2>
      <div className={styles.status} role="status" aria-live="polite"><Icon size={21}/><span>{label}</span></div>
      <dl className={styles.details}>
        <div><dt>提交类型</dt><dd>{submission.operation === "update" ? "修改作品" : "发布作品"} · {submission.kind === "template" ? "Prompt 管理" : "人格与聊天配置"}</dd></div>
        <div><dt>提交时间</dt><dd>{new Date(submission.createdMs).toLocaleString("zh-CN")}</dd></div>
        {pending && <div><dt>最晚完成时间</dt><dd>{new Date(job.deadlineMs).toLocaleString("zh-CN")}</dd></div>}
      </dl>
      {job.error && <p className="form-error" role="alert">{job.error}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {pending && <p className={styles.help}>审核完成后自动更新。可以关闭窗口，稍后在账号中心继续查看。</p>}
      <div className="dialog-actions">
        <button type="button" className="key" onClick={onClose}>{pending ? "后台等待" : "关闭"}</button>
        {error && <button type="button" className="key" disabled={reading} onClick={() => setRetry(value => value + 1)}><RefreshCw size={14}/>重新查询</button>}
        {job.state === "published" && <a className="key hot-key" href={`/?prompt=${encodeURIComponent(job.workId)}`}>查看作品<ArrowUpRight size={14}/></a>}
      </div>
    </div>
  </WindowDialog>;
}

export default function AccountReviews({ kind, revision, refresh, onSummary, onSettled }: {
  kind: Kind | ""; revision: number; refresh: number; onSummary: (summary: PendingSummary) => void; onSettled: () => void;
}) {
  const [jobs, setJobs] = useState<Submission[]>([]);
  const [selected, setSelected] = useState<Submission | null>(null);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let busy = false, previous: Map<string, Submission> | null = null, count = 0;
    onSummary({ count: 0, loading: true, failed: false });
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Do not show the previous account/filter job list while the new server subscription starts.
    setJobs([]); setError("");
    const load = async () => {
      if (busy || controller.signal.aborted) return;
      busy = true;
      try {
        const response = await fetch(`/api/moderation/jobs?kind=${kind}`, { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]) });
        const data = await response.json() as { jobs?: Submission[]; error?: string };
        if (!response.ok || !Array.isArray(data.jobs)) throw new Error(data.error || "待审核投稿暂时加载失败。");
        if (controller.signal.aborted) return;
        const next = new Map(data.jobs.map(job => [job.id, job]));
        const completed = previous ? [...previous.values()].filter(job => !next.has(job.id)) : [];
        completed.forEach(forgetCompletedDraft);
        previous = next; count = data.jobs.length;
        setJobs(data.jobs); setError(""); onSummary({ count, loading: false, failed: false });
        if (completed.length) onSettled();
      } catch (cause) {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : "待审核投稿暂时加载失败。");
          onSummary({ count, loading: false, failed: true });
        }
      } finally { busy = false; }
    };
    void load();
    const timer = setInterval(() => { if (document.visibilityState !== "hidden") void load(); }, 3000);
    const visible = () => { if (document.visibilityState !== "hidden") void load(); };
    document.addEventListener("visibilitychange", visible);
    return () => { controller.abort(); clearInterval(timer); document.removeEventListener("visibilitychange", visible); };
  }, [kind, revision, refresh, reload, onSummary, onSettled]);
  const finished = useCallback(() => { onSettled(); setReload(value => value + 1); }, [onSettled]);
  return <>
    {error && <p className="load-error" role="alert">{error}</p>}
    {!!jobs.length && <div className={`account-works ${styles.pendingList}`} aria-label="待审核投稿">{jobs.map(job => <article className="account-work" key={job.id}>
      <button type="button" className={styles.card} onClick={() => setSelected(job)} aria-label={`查看审核进度：${job.title || "未命名作品"}`}>
        <span className={styles.heading}><span className="card-type">{job.kind === "template" ? "Prompt 管理" : "人格与聊天配置"}</span><span className={styles.badge}><Clock3 size={12}/>待审核</span></span>
        <strong className={styles.title}>{job.title || "未命名作品"}</strong>
        {job.description && <span className={styles.description}>{job.description}</span>}
        <span className={styles.bottom}><time dateTime={new Date(job.createdMs).toISOString()}>{job.operation === "update" ? "修改提交于 " : "提交于 "}{new Date(job.createdMs).toLocaleDateString("zh-CN")}</time><span className={styles.open}>查看进度<ArrowUpRight size={13}/></span></span>
      </button>
    </article>)}</div>}
    {selected && <ReviewProgress key={selected.id} submission={selected} onClose={() => setSelected(null)} onFinished={finished}/>}
  </>;
}

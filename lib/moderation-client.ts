export type ReviewJob = { id: string; workId: string; operation: "create" | "update"; state: "queued" | "running" | "published" | "rejected" | "error"; ahead: number; deadlineMs: number; httpStatus: number; error: string };
export class ReviewReadError extends Error { constructor(message: string, public missing = false) { super(message); } }

export async function waitForReview(id: string, signal: AbortSignal, progress: (job: ReviewJob) => void) {
  let lastSuccess = Date.now();
  while (!signal.aborted) {
    try {
      const response = await fetch(`/api/moderation/jobs/${encodeURIComponent(id)}`, { cache: "no-store", signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]) });
      const data = await response.json() as { job?: ReviewJob; error?: string };
      if ([401, 403, 404].includes(response.status)) throw new ReviewReadError(data.error || "无法读取审核进度。", response.status === 404);
      if (!response.ok || !data.job) throw new Error("temporary");
      lastSuccess = Date.now(); progress(data.job);
      if (!["queued", "running"].includes(data.job.state)) return data.job;
    } catch (error) {
      if (signal.aborted) throw signal.reason;
      if (error instanceof ReviewReadError) throw error;
      if (Date.now() - lastSuccess > 30000) throw new ReviewReadError("暂时无法连接。任务仍在后台，请重新查询进度。");
    }
    await new Promise<void>((resolve, reject) => {
      const done = () => { signal.removeEventListener("abort", abort); resolve(); };
      const timer = setTimeout(done, 1500);
      const abort = () => { clearTimeout(timer); reject(signal.reason); };
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
    });
  }
  throw signal.reason;
}

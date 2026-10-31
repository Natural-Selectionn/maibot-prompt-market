"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { MessageSquareText, PenLine, Reply, Star, Trash2, X } from "lucide-react";
import { AccountName } from "@/components/account-name";
import type { CommunityStats } from "@/lib/prompts";
import type { CommentThread, PublicComment, ReplyPage } from "@/lib/discussion";

type CommunityResponse = { stats: CommunityStats; myRating: number | null; comments: CommentThread[]; hasMore: boolean };

async function jsonRequest<T>(url: string, method = "GET", payload?: object): Promise<T> {
  const response = await fetch(url, { method, ...(payload ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) } : {}) });
  const result = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(result.error || "操作失败，请稍后重试。");
  return result as T;
}

function useGrowingInput(value: string, visible: boolean | string) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const resize = () => {
      const input = ref.current;
      if (!input) return;
      input.style.height = "auto";
      input.style.height = `${input.scrollHeight + input.offsetHeight - input.clientHeight}px`;
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [value, visible]);
  return ref;
}

function AuthorBadge() {
  return <span className="comment-author-badge"><PenLine size={10} aria-hidden="true"/>作者</span>;
}

function CommentEntry({ comment, busy, onReply, onDelete }: { comment: PublicComment; busy: boolean; onReply: (comment: PublicComment) => void; onDelete: (comment: PublicComment) => void }) {
  return <div className={`comment ${comment.deleted ? "comment-removed" : ""}`} id={`comment-${comment.id}`} data-comment-id={comment.id} tabIndex={-1}>
    <div className="comment-meta">
      {!comment.deleted && <><strong><AccountName name={comment.author} tag={comment.authorTag} profileTag={comment.authorProfileTag}/></strong>{comment.isAuthor && <AuthorBadge/>}</>}
      <time dateTime={comment.createdAt}>{new Date(comment.createdAt).toLocaleString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</time>
      {comment.mine && <button type="button" className="comment-delete" onClick={() => onDelete(comment)} disabled={busy} aria-label="删除我的评论"><Trash2 size={14}/></button>}
    </div>
    {!comment.deleted && comment.replyTo && <div className="comment-reply-target">回复 <AccountName name={comment.replyTo.deleted ? "已删除评论" : comment.replyTo.author} tag={comment.replyTo.authorTag} profileTag={comment.replyTo.authorProfileTag}/>{comment.replyTo.isAuthor && <AuthorBadge/>}</div>}
    <p className={comment.deleted ? "comment-deleted" : undefined}>{comment.deleted ? "该评论已删除" : comment.body}</p>
    {!comment.deleted && <div className="comment-actions"><button type="button" className="text-link reply-button" onClick={() => onReply(comment)} disabled={busy}><Reply size={13}/>回复</button></div>}
  </div>;
}

export default function CommunityPanel({ focusCommentId, onLocated, itemId, signedIn, onLogin, onStats }: { focusCommentId?: string|null; onLocated?: () => void; itemId: string; signedIn: boolean; onLogin: () => void; onStats: (id: string, stats: CommunityStats, changed?: boolean) => void }) {
  const [stats, setStats] = useState<CommunityStats>({ average: null, ratingsCount: 0, commentCount: 0, copyCount: 0, downloadCount: 0 });
  const [myRating, setMyRating] = useState<number | null>(null);
  const [comments, setComments] = useState<CommentThread[]>([]);
  const [replyPages, setReplyPages] = useState<Record<string, ReplyPage>>({});
  const [replyingTo, setReplyingTo] = useState<PublicComment | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [body, setBody] = useState("");
  const [locationError,setLocationError] = useState("");
  const [locating,setLocating] = useState(!!focusCommentId);
  const [locationRetry,setLocationRetry] = useState(0);
  const [locationReady,setLocationReady] = useState(false);
  const [focusThread,setFocusThread] = useState<CommentThread|null>(null);
  const located = useRef(false);
  const commentOperation = useRef<{body:string;key:string}|null>(null);
  const replyOperation = useRef<{body:string;target:string;key:string}|null>(null);
  const commentInput = useGrowingInput(body, signedIn);
  const replyInput = useGrowingInput(replyBody, replyingTo?.id ?? "");
  const endpoint = `/api/prompts/${encodeURIComponent(itemId)}/community`;

  const load = useCallback(async (offset = 0, append = false, changed = false) => {
    const data = await jsonRequest<CommunityResponse>(`${endpoint}?offset=${offset}`);
    setStats(data.stats); setMyRating(data.myRating); setHasMore(data.hasMore);
    setComments(previous => append ? [...previous, ...data.comments.filter(item => !previous.some(old => old.id === item.id))] : data.comments);
    onStats(itemId, data.stats, changed);
  }, [endpoint, itemId, onStats]);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- The discussion request depends on parent identity/item changes; stale permissions must not stay interactive.
    setLoading(true); setError("");
    load().catch(cause => { if (!cancelled) setError(cause instanceof Error ? cause.message : "讨论加载失败。"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [load, signedIn]);

  useEffect(() => {
    if (!focusCommentId || loading) return;
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- A notification target must enter the pending state before its server-side comment lookup.
    setLocating(true); setLocationError("");
    void fetch(`${endpoint}/locate?comment=${encodeURIComponent(focusCommentId)}`,{cache:"no-store",signal:controller.signal}).then(async response=>{
      const data = await response.json() as {error?:string;thread:CommentThread;replyPage:ReplyPage|null};
      if (!response.ok) throw new Error(data.error || "评论定位失败。");
      if (controller.signal.aborted) return;
      setFocusThread(data.thread);
      if (data.replyPage) setReplyPages(previous=>({...previous,[data.thread.id]:data.replyPage!}));
      setLocationReady(true);
    }).catch(cause=>{if(!controller.signal.aborted) setLocationError(cause instanceof Error ? cause.message : "评论定位失败。");}).finally(()=>{if(!controller.signal.aborted) setLocating(false);});
    return ()=>controller.abort();
  },[focusCommentId,endpoint,loading,locationRetry]);
  useEffect(()=>{
    if (!focusCommentId || !locationReady || located.current) return;
    const element=document.getElementById(`comment-${focusCommentId}`);
    if (!element) return;
    located.current=true;
    element.classList.add("comment-highlight");
    element.scrollIntoView({block:"center",behavior:"instant"}); element.focus({preventScroll:true});
    onLocated?.();
  },[focusCommentId,locationReady,comments,replyPages,onLocated]);

  useEffect(() => { if (replyingTo) replyInput.current?.focus(); }, [replyingTo, replyInput]);

  const refresh = async () => {
    const pageCount = Math.max(1, Math.ceil(comments.length / 20));
    for (let page = 0; page < pageCount; page++) await load(page * 20, page > 0, page === 0);
  };
  const loadReplies = async (rootId: string, offset = 0, last = false) => {
    const page = await jsonRequest<ReplyPage>(`${endpoint}?thread=${encodeURIComponent(rootId)}&offset=${offset}${last ? "&last=1" : ""}`);
    setReplyPages(previous => ({ ...previous, [rootId]: page }));
  };
  const act = async (action: () => Promise<void>) => {
    setBusy(true); setError("");
    try { await action(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "操作失败。"); }
    finally { setBusy(false); }
  };
  const rate = (score: number) => act(async () => {
    await jsonRequest(endpoint, "POST", { type: "rating", score });
    await refresh();
  });
  const submitComment = (event: FormEvent) => {
    event.preventDefault();
    if (!body.trim()) { setError("请输入评论。"); return; }
    void act(async () => {
      if (!commentOperation.current || commentOperation.current.body !== body) commentOperation.current={body,key:crypto.randomUUID()};
      await jsonRequest(endpoint, "POST", { type: "comment", body, operationKey:commentOperation.current.key });
      commentOperation.current=null;
      setBody("");
      await load();
    });
  };
  const startReply = (comment: PublicComment) => {
    if (!signedIn) { onLogin(); return; }
    setReplyingTo(comment); setError("");
  };
  const submitReply = (event: FormEvent) => {
    event.preventDefault();
    if (!replyingTo || !replyBody.trim()) { setError("请输入回复。"); return; }
    const target = replyingTo;
    void act(async () => {
      if (!replyOperation.current || replyOperation.current.body!==replyBody || replyOperation.current.target!==target.id) replyOperation.current={body:replyBody,target:target.id,key:crypto.randomUUID()};
      const result = await jsonRequest<{ rootId: string }>(endpoint, "POST", { type: "comment", body: replyBody, replyToId: target.id, operationKey:replyOperation.current.key });
      replyOperation.current=null;
      setReplyingTo(null); setReplyBody("");
      await loadReplies(result.rootId, 0, true);
      await refresh();
    });
  };
  const removeRating = () => act(async () => { await jsonRequest(endpoint, "DELETE"); await refresh(); });
  const removeComment = (comment: PublicComment) => {
    if (!window.confirm("确定删除这条评论？")) return;
    void act(async () => {
      await jsonRequest(`${endpoint}/${encodeURIComponent(comment.id)}`, "DELETE");
      setFocusThread(previous=>previous?.id===comment.id ? {...previous,body:"",author:"",deleted:true,mine:false,isAuthor:false} : previous);
      if (focusCommentId===comment.id) setLocationError("这条评论已删除。");
      if (replyingTo?.id === comment.id) { setReplyingTo(null); setReplyBody(""); }
      const rootId = comment.rootId ?? comment.id;
      const page = replyPages[rootId];
      if (page) await loadReplies(rootId, page.offset);
      await refresh();
    });
  };
  const more = async () => {
    setLoading(true); setError("");
    try { await load(comments.length, true); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "讨论加载失败。"); }
    finally { setLoading(false); }
  };

  return <section className="community" aria-label="评论与评分">
    <div className="community-heading"><span>DISCUSSION</span><strong>评论与评分</strong><small>{stats.commentCount} 条评论</small></div>
    {focusCommentId && <div className="comment-location" role="status">{locating ? "正在定位评论…" : locationError ? <>{locationError} <button type="button" className="text-link" onClick={()=>setLocationRetry(value=>value+1)}>重试定位</button></> : "已定位到消息对应的评论"}</div>}
    <div className="rating-panel"><div><span className="rating-number">{stats.average === null ? "—" : stats.average.toFixed(1)}</span><span className="rating-caption"> / 5 <small>{stats.ratingsCount} 人评分</small></span></div><div className="rating-input"><span>{myRating ? "我的评分" : "给这篇作品评分"}</span><div role="group" aria-label="五星评分">{[1, 2, 3, 4, 5].map(score => signedIn ? <button key={score} className={`star-button ${myRating && score <= myRating ? "filled" : ""}`} onClick={() => rate(score)} disabled={busy} aria-label={`${score} 星`} aria-pressed={myRating === score}><Star size={20}/></button> : <Star key={score} className="star-static" size={20}/> )}</div>{!signedIn && <button className="text-link" onClick={onLogin}>登录后评分</button>}{myRating && <button className="comment-delete" disabled={busy} onClick={removeRating}>撤回</button>}</div></div>
    {signedIn ? <form className="comment-form" onSubmit={submitComment}><div className="comment-inputs"><label>评论<textarea ref={commentInput} value={body} onChange={event => setBody(event.target.value)} maxLength={1000} rows={3} placeholder="分享你的使用感受" required/></label></div><div className="comment-submit"><span>{body.length}/1000</span><button className="key hot-key small-key" disabled={busy}>发表评论</button></div></form> : <div className="comment-login"><MessageSquareText size={16}/><button className="text-link" onClick={onLogin}>登录后评论</button></div>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="comments-list">{(focusThread ? [focusThread,...comments.filter(item=>item.id!==focusThread.id)] : comments).map(thread => {
      const page = replyPages[thread.id];
      const replying = replyingTo && (replyingTo.rootId ?? replyingTo.id) === thread.id;
      return <article className="comment-thread" key={thread.id}>
        <CommentEntry comment={thread} busy={busy} onReply={startReply} onDelete={removeComment}/>
        {thread.replyCount > 0 && <button type="button" className="text-link thread-toggle" disabled={busy} aria-expanded={!!page} onClick={() => page ? setReplyPages(previous => { const next = { ...previous }; delete next[thread.id]; return next; }) : void act(() => loadReplies(thread.id))}>{page ? "收起回复" : `${thread.replyCount} 条回复`}</button>}
        {page && <div className="comment-replies" aria-label="楼中楼回复">{page.replies.map(reply => <CommentEntry key={reply.id} comment={reply} busy={busy} onReply={startReply} onDelete={removeComment}/>)}{(page.offset > 0 || page.hasMore) && <div className="reply-pagination"><button type="button" className="key small-key" disabled={busy || page.offset === 0} onClick={() => act(() => loadReplies(thread.id, Math.max(0, page.offset - 20)))}>上一页</button><span>{page.offset + 1}–{page.offset + page.replies.length} / {page.total}</span><button type="button" className="key small-key" disabled={busy || !page.hasMore} onClick={() => act(() => loadReplies(thread.id, page.offset + 20))}>下一页</button></div>}</div>}
        {replying && <form className="comment-form reply-form" onSubmit={submitReply}><div className="reply-form-heading"><span>回复 <strong><AccountName name={replyingTo.author} tag={replyingTo.authorTag} profileTag={replyingTo.authorProfileTag}/></strong>{replyingTo.isAuthor && <AuthorBadge/>}</span><button type="button" className="comment-delete" aria-label="取消回复" onClick={() => { setReplyingTo(null); setReplyBody(""); }}><X size={14}/></button></div><div className="comment-inputs"><label><span className="sr-only">回复内容</span><textarea ref={replyInput} value={replyBody} onChange={event => setReplyBody(event.target.value)} maxLength={1000} rows={2} placeholder="写下你的回复" required/></label></div><div className="comment-submit"><span>{replyBody.length}/1000</span><button className="key hot-key small-key" disabled={busy}>发表回复</button></div></form>}
      </article>;
    })}</div>
    {!loading && comments.length === 0 && <p className="comment-empty">暂无评论</p>}
    {hasMore && <button className="key small-key" disabled={loading || busy} onClick={more}>{loading ? "加载中…" : "加载更多评论"}</button>}
  </section>;
}

import { env } from "@/db/binding";
import { GET as discussion } from "../route";
import type { CommunityStats } from "@/lib/prompts";
import type { CommentThread, ReplyPage } from "@/lib/discussion";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const url = new URL(request.url), target = url.searchParams.get("comment");
  const headers = { "Cache-Control": "no-store" };
  if (!target || target.length>80) return Response.json({ error: "评论标识无效。" }, { status: 400, headers });
  try {
    const row = await env.DB!.prepare("SELECT id,root_id,deleted_at,created_at FROM prompt_comments WHERE id=? AND prompt_id=?").bind(target,id).first<{id:string;root_id:string|null;deleted_at:string|null;created_at:string}>();
    if (!row || row.deleted_at) return Response.json({ error: "这条评论已删除或不存在。" }, { status: 404, headers });
    const root = row.root_id || row.id;
    url.search = ""; url.searchParams.set("root",root);
    const response = await discussion(new Request(url),context);
    if (!response.ok) return response;
    const data = await response.json() as {comments:CommentThread[];stats:CommunityStats};
    if (!data.comments?.length) return Response.json({ error: "作品或评论已删除。" }, { status: 404, headers });
    let replyPage: ReplyPage|null = null;
    if (row.root_id) {
      const count = Number(await env.DB!.prepare("SELECT count(*) AS count FROM prompt_comments WHERE prompt_id=? AND root_id=? AND (created_at<? OR (created_at=? AND id<?))").bind(id,root,row.created_at,row.created_at,row.id).first("count"));
      url.search = ""; url.searchParams.set("thread",root); url.searchParams.set("offset",String(Math.floor(count/20)*20));
      const replies = await discussion(new Request(url),context);
      if (!replies.ok) return replies;
      replyPage = await replies.json() as ReplyPage;
    }
    return Response.json({ thread: data.comments[0], replyPage, stats: data.stats }, { headers });
  } catch (error) {
    console.error("Comment location failed",error);
    return Response.json({ error: "评论定位暂时失败，请重试。" }, { status: 503, headers });
  }
}

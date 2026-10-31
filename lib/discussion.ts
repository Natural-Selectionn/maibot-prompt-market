export type PublicComment = {
  id: string;
  rootId: string | null;
  author: string;
  authorTag?: string;
  authorProfileTag?: string;
  body: string;
  createdAt: string;
  mine: boolean;
  isAuthor: boolean;
  deleted: boolean;
  replyTo: { id: string; author: string; authorTag?: string; authorProfileTag?: string; isAuthor: boolean; deleted: boolean } | null;
};
export type CommentThread = PublicComment & { replyCount: number };
export type ReplyPage = { replies: PublicComment[]; total: number; offset: number; hasMore: boolean };

type StoredComment = { id: string; rootId: string | null; userId: string; author: string; body: string; createdAt: string; deletedAt: string | null };
type ReplyTarget = Pick<StoredComment, "id" | "userId" | "author" | "deletedAt">;

// Ownership is verified with account IDs; equal display names confer no badge.
export function publicComment(row: StoredComment, ownerId: string | null, viewerId?: string, target?: ReplyTarget | null, authors?: Map<string, { author: string; authorTag: string; authorProfileTag?: string }>): PublicComment {
  const deleted = row.deletedAt !== null;
  return {
    id: row.id, rootId: row.rootId, createdAt: row.createdAt,
    ...(deleted ? { author: "" } : authors?.get(row.userId) ?? { author: row.author }), body: deleted ? "" : row.body, deleted,
    mine: !deleted && row.userId === viewerId,
    isAuthor: !deleted && ownerId !== null && row.userId === ownerId,
    replyTo: target ? { id: target.id, ...(target.deletedAt ? { author: "" } : authors?.get(target.userId) ?? { author: target.author }), deleted: target.deletedAt !== null, isAuthor: !target.deletedAt && ownerId !== null && target.userId === ownerId } : null,
  };
}

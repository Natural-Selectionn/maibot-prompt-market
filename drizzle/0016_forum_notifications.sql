ALTER TABLE prompt_comments ADD COLUMN operation_key text;
--> statement-breakpoint
CREATE UNIQUE INDEX prompt_comments_operation ON prompt_comments(user_id, operation_key);
--> statement-breakpoint
CREATE INDEX prompt_comments_user_created ON prompt_comments(user_id, created_at);
--> statement-breakpoint
CREATE TABLE notifications (
  id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  recipient_user_id text NOT NULL,
  source_key text NOT NULL,
  type text NOT NULL CHECK(type IN ('comment','reply','rating')),
  actor_user_id text NOT NULL,
  prompt_id text NOT NULL,
  comment_id text,
  created_at text NOT NULL,
  read_at text,
  invalidated_at text
);
--> statement-breakpoint
CREATE UNIQUE INDEX notifications_source ON notifications(recipient_user_id, source_key);
--> statement-breakpoint
CREATE INDEX notifications_inbox ON notifications(recipient_user_id, invalidated_at, read_at, id);
--> statement-breakpoint
CREATE INDEX notifications_prompt ON notifications(prompt_id);

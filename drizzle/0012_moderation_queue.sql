ALTER TABLE moderation_settings ADD COLUMN budget_ms integer NOT NULL DEFAULT 600000;
--> statement-breakpoint
ALTER TABLE moderation_settings ADD COLUMN instructions text NOT NULL DEFAULT '';
--> statement-breakpoint
UPDATE moderation_settings SET timeout_ms=150000, budget_ms=600000, revision='queue-' || lower(hex(randomblob(16))), updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=1;
--> statement-breakpoint
CREATE TABLE moderation_jobs (
  seq integer PRIMARY KEY AUTOINCREMENT,
  id text NOT NULL UNIQUE,
  actor_id text NOT NULL,
  work_id text NOT NULL,
  operation text NOT NULL,
  request_hash text NOT NULL,
  revision text NOT NULL DEFAULT '',
  state text NOT NULL DEFAULT 'queued',
  payload text NOT NULL,
  config text NOT NULL,
  created_ms integer NOT NULL,
  deadline_ms integer NOT NULL,
  started_ms integer,
  finished_ms integer,
  lease_ms integer NOT NULL DEFAULT 0,
  claim_token text NOT NULL DEFAULT '',
  provider_id text NOT NULL DEFAULT '',
  attempts integer NOT NULL DEFAULT 0,
  error_code text NOT NULL DEFAULT '',
  http_status integer NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE INDEX moderation_jobs_waiting ON moderation_jobs(state,seq);
--> statement-breakpoint
CREATE INDEX moderation_jobs_actor ON moderation_jobs(actor_id,created_ms);

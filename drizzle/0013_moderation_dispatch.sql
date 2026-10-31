CREATE TABLE moderation_provider_calls (
  id text PRIMARY KEY,
  job_id text NOT NULL,
  provider_id text NOT NULL,
  resource_key text NOT NULL,
  started_ms integer NOT NULL,
  finished_ms integer,
  duration_ms integer NOT NULL DEFAULT 0,
  allowance_ms integer NOT NULL,
  lease_ms integer NOT NULL,
  outcome text NOT NULL DEFAULT 'running'
);
--> statement-breakpoint
CREATE INDEX moderation_calls_resource ON moderation_provider_calls(resource_key,started_ms);
--> statement-breakpoint
CREATE INDEX moderation_calls_job ON moderation_provider_calls(job_id,provider_id);
--> statement-breakpoint
CREATE TABLE moderation_provider_health (
  resource_key text PRIMARY KEY,
  failures integer NOT NULL DEFAULT 0,
  cooldown_ms integer NOT NULL DEFAULT 0
);

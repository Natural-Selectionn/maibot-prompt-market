ALTER TABLE prompts ADD COLUMN min_version text NOT NULL DEFAULT '1.0.0';
--> statement-breakpoint
ALTER TABLE prompts ADD COLUMN max_version text;
--> statement-breakpoint
ALTER TABLE prompts ADD COLUMN min_version_key text NOT NULL DEFAULT '000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000000000000000000000';
--> statement-breakpoint
ALTER TABLE prompts ADD COLUMN max_version_key text;
--> statement-breakpoint
ALTER TABLE prompts DROP COLUMN version;
--> statement-breakpoint
CREATE INDEX prompts_version_range ON prompts(min_version_key,max_version_key);

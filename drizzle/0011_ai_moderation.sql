CREATE TABLE `moderation_events` (
	`id` text PRIMARY KEY NOT NULL,
	`work_id` text NOT NULL,
	`operation` text NOT NULL,
	`status` text NOT NULL,
	`category` text NOT NULL,
	`provider_id` text NOT NULL,
	`attempts` integer NOT NULL,
	`cause` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `moderation_events_created` ON `moderation_events` (`created_at`);--> statement-breakpoint
CREATE TABLE `moderation_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`timeout_ms` integer DEFAULT 8000 NOT NULL,
	`max_attempts` integer DEFAULT 2 NOT NULL,
	`providers` text DEFAULT '[]' NOT NULL,
	`revision` text DEFAULT 'initial' NOT NULL,
	`updated_at` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
INSERT INTO moderation_settings (id) VALUES (1);

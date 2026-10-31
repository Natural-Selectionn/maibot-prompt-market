CREATE TABLE `prompt_usage` (
	`prompt_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`action` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`prompt_id`, `actor_id`, `action`),
	FOREIGN KEY (`prompt_id`) REFERENCES `prompts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `prompt_usage_recent` ON `prompt_usage` (`prompt_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `prompt_usage_actor` ON `prompt_usage` (`actor_id`);--> statement-breakpoint
CREATE TABLE `usage_visitors` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`created_at` text NOT NULL
);

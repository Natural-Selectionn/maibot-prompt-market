CREATE TABLE `prompt_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`prompt_id` text NOT NULL,
	`user_id` text NOT NULL,
	`author` text NOT NULL,
	`body` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `prompt_comments_prompt_created` ON `prompt_comments` (`prompt_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `prompt_ratings` (
	`prompt_id` text NOT NULL,
	`user_id` text NOT NULL,
	`score` integer NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`prompt_id`, `user_id`)
);
--> statement-breakpoint
ALTER TABLE `prompts` ADD `kind` text DEFAULT 'config' NOT NULL;--> statement-breakpoint
ALTER TABLE `prompts` ADD `template_name` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `prompts` ADD `template_locale` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `prompts` ADD `template_content` text DEFAULT '' NOT NULL;
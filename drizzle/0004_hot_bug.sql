ALTER TABLE `prompt_comments` ADD `root_id` text;--> statement-breakpoint
ALTER TABLE `prompt_comments` ADD `reply_to_id` text;--> statement-breakpoint
ALTER TABLE `prompt_comments` ADD `deleted_at` text;--> statement-breakpoint
CREATE INDEX `prompt_comments_thread_created` ON `prompt_comments` (`prompt_id`,`root_id`,`created_at`);
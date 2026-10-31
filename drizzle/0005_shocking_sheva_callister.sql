CREATE TABLE `user_profiles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`display_name` text NOT NULL,
	`name_key` text NOT NULL,
	`disambiguated` integer DEFAULT false NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_profiles_user_id_unique` ON `user_profiles` (`user_id`);--> statement-breakpoint
CREATE INDEX `user_profiles_name_key` ON `user_profiles` (`name_key`);--> statement-breakpoint
ALTER TABLE `prompts` ADD `updated_at` text;
CREATE TABLE `prompts` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`title` text NOT NULL,
	`author` text NOT NULL,
	`description` text NOT NULL,
	`category` text NOT NULL,
	`scene` text NOT NULL,
	`version` text NOT NULL,
	`tags` text NOT NULL,
	`fields` text NOT NULL,
	`created_at` text NOT NULL
);

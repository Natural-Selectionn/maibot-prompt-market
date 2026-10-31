CREATE TABLE `email_challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`code_hash` text NOT NULL,
	`browser_hash` text NOT NULL,
	`display_name` text NOT NULL,
	`return_to` text NOT NULL,
	`link_user_id` text,
	`link_session_hash` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `email_challenges_expiry` ON `email_challenges` (`expires_at`);--> statement-breakpoint
CREATE TABLE `email_rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`reset_at` integer NOT NULL,
	`last_sent_at` integer NOT NULL
);

CREATE TABLE `water_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`entry_date` text NOT NULL,
	`amount_ml` real NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_water_entries_user_date` ON `water_entries` (`user_id`,`entry_date`);--> statement-breakpoint
CREATE TABLE `water_goals` (
	`user_id` text PRIMARY KEY NOT NULL,
	`goal_ml` real DEFAULT 2000 NOT NULL,
	`unit` text DEFAULT 'ml' NOT NULL,
	`updated_at` text NOT NULL
);

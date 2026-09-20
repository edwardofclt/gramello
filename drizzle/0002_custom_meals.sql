CREATE TABLE `custom_meals` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`ingredients` text NOT NULL,
	`total_grams` real,
	`serving_grams` real NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_custom_meals_user` ON `custom_meals` (`user_id`);
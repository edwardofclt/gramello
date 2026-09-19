CREATE TABLE `entries` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`entry_date` text NOT NULL,
	`meal` text NOT NULL,
	`food_name` text NOT NULL,
	`brand` text,
	`source` text NOT NULL,
	`source_id` text,
	`quantity` real NOT NULL,
	`unit` text NOT NULL,
	`grams` real NOT NULL,
	`calories` real NOT NULL,
	`protein` real NOT NULL,
	`carbs` real NOT NULL,
	`fat` real NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `goals` (
	`user_id` text PRIMARY KEY NOT NULL,
	`calories` integer DEFAULT 2400 NOT NULL,
	`protein` integer DEFAULT 180 NOT NULL,
	`carbs` integer DEFAULT 250 NOT NULL,
	`fat` integer DEFAULT 70 NOT NULL,
	`updated_at` text NOT NULL
);

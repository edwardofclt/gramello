CREATE TABLE `foods` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`brand` text,
	`source` text NOT NULL,
	`source_kind` text NOT NULL,
	`source_url` text,
	`verified` integer DEFAULT false NOT NULL,
	`nutrition_basis` text NOT NULL,
	`serving_grams` real,
	`serving_ml` real,
	`serving_label` text NOT NULL,
	`calories` real NOT NULL,
	`protein` real NOT NULL,
	`carbs` real NOT NULL,
	`fat` real NOT NULL,
	`image` text,
	`created_by` text,
	`checked_at` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_foods_name` ON `foods` (`name`);--> statement-breakpoint
CREATE INDEX `idx_foods_brand` ON `foods` (`brand`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_entries` (
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
	`grams` real,
	`verified` integer DEFAULT false NOT NULL,
	`source_url` text,
	`serving_label` text,
	`calories` real NOT NULL,
	`protein` real NOT NULL,
	`carbs` real NOT NULL,
	`fat` real NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_entries`("id", "user_id", "entry_date", "meal", "food_name", "brand", "source", "source_id", "quantity", "unit", "grams", "verified", "source_url", "serving_label", "calories", "protein", "carbs", "fat", "created_at") SELECT "id", "user_id", "entry_date", "meal", "food_name", "brand", "source", "source_id", "quantity", "unit", "grams", 0, NULL, NULL, "calories", "protein", "carbs", "fat", "created_at" FROM `entries`;--> statement-breakpoint
DROP TABLE `entries`;--> statement-breakpoint
ALTER TABLE `__new_entries` RENAME TO `entries`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_entries_user_date` ON `entries` (`user_id`,`entry_date`);
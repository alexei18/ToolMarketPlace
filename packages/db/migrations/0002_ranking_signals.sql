CREATE TABLE `product_signal_daily` (
	`product_id` text NOT NULL,
	`day` integer NOT NULL,
	`type` text NOT NULL,
	`count` integer NOT NULL,
	PRIMARY KEY(`product_id`, `day`, `type`),
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `product_signals` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`day` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_signals_product_user_type_day` ON `product_signals` (`product_id`,`user_id`,`type`,`day`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_signals_once` ON `product_signals` (`product_id`,`user_id`,`type`) WHERE "product_signals"."type" in ('save', 'perk_claim');--> statement-breakpoint
CREATE INDEX `idx_signals_day` ON `product_signals` (`day`);--> statement-breakpoint
ALTER TABLE `products` ADD `has_ai` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `platforms` text DEFAULT '["web"]' NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `staff_pick_at` integer;--> statement-breakpoint
ALTER TABLE `products` ADD `staff_pick_note` text;--> statement-breakpoint
ALTER TABLE `products` ADD `score_week` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `score_trending` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `quality_ok` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `ranked_at` integer;
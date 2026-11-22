CREATE TABLE `review_cases` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`kind` text NOT NULL,
	`details` text NOT NULL,
	`created_at` integer NOT NULL,
	`resolved_at` integer,
	`resolved_by` text,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`resolved_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_review_cases_product` ON `review_cases` (`product_id`,`resolved_at`);--> statement-breakpoint
CREATE INDEX `idx_review_cases_open` ON `review_cases` (`resolved_at`,"created_at" DESC);--> statement-breakpoint
ALTER TABLE `products` ADD `link_checked_at` integer;--> statement-breakpoint
ALTER TABLE `products` ADD `link_failures` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_products_top` ON `products` (`status`,`quality_ok`,"score_week" DESC);--> statement-breakpoint
CREATE INDEX `idx_products_trending` ON `products` (`status`,`quality_ok`,"score_trending" DESC);--> statement-breakpoint
CREATE INDEX `idx_products_link_check` ON `products` (`status`,`link_checked_at`);--> statement-breakpoint
CREATE INDEX `idx_signal_daily_day` ON `product_signal_daily` (`day`);
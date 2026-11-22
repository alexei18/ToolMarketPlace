CREATE TABLE `account_deletions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`deleted_at` integer NOT NULL
);
--> statement-breakpoint
-- feedback.user_id becomes nullable. D1 always enforces foreign keys, so dropping the old table
-- runs ON DELETE SET NULL on roadmap_items.from_feedback_id: keep those links aside and restore them.
CREATE TABLE `__roadmap_feedback_links` AS SELECT `id`, `from_feedback_id` FROM `roadmap_items` WHERE `from_feedback_id` IS NOT NULL;--> statement-breakpoint
CREATE TABLE `__new_feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`user_id` text,
	`type` text NOT NULL,
	`body` text NOT NULL,
	`is_public` integer NOT NULL,
	`maker_reply` text,
	`resolved_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_feedback`("id", "product_id", "user_id", "type", "body", "is_public", "maker_reply", "resolved_at", "created_at") SELECT "id", "product_id", "user_id", "type", "body", "is_public", "maker_reply", "resolved_at", "created_at" FROM `feedback`;--> statement-breakpoint
DROP TABLE `feedback`;--> statement-breakpoint
ALTER TABLE `__new_feedback` RENAME TO `feedback`;--> statement-breakpoint
UPDATE `roadmap_items` SET `from_feedback_id` = (SELECT l.`from_feedback_id` FROM `__roadmap_feedback_links` l WHERE l.`id` = `roadmap_items`.`id`) WHERE `id` IN (SELECT `id` FROM `__roadmap_feedback_links`);--> statement-breakpoint
DROP TABLE `__roadmap_feedback_links`;--> statement-breakpoint
CREATE INDEX `idx_feedback_product` ON `feedback` (`product_id`,"created_at" DESC);--> statement-breakpoint
CREATE INDEX `idx_feedback_user` ON `feedback` (`user_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `user` ADD `utm_source` text;--> statement-breakpoint
ALTER TABLE `user` ADD `utm_campaign` text;--> statement-breakpoint
ALTER TABLE `user` ADD `utm_content` text;

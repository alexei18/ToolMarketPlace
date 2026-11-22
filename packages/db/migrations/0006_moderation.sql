CREATE TABLE `moderation_decisions` (
	`id` text PRIMARY KEY NOT NULL,
	`target_type` text NOT NULL,
	`product_id` text,
	`user_id` text,
	`parent_id` text,
	`action` text NOT NULL,
	`trigger` text NOT NULL,
	`automated` integer NOT NULL,
	`rule` text NOT NULL,
	`facts` text NOT NULL,
	`decided_by` text,
	`created_at` integer NOT NULL,
	`reversed_at` integer,
	`reversed_by` text,
	`contest_body` text,
	`contested_at` integer,
	`contest_outcome` text,
	`contest_response` text,
	`contest_resolved_at` integer,
	`contest_resolved_by` text,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`parent_id`) REFERENCES `moderation_decisions`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`decided_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`reversed_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`contest_resolved_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_decisions_user` ON `moderation_decisions` (`user_id`,"created_at" DESC);--> statement-breakpoint
CREATE INDEX `idx_decisions_product` ON `moderation_decisions` (`product_id`,"created_at" DESC);--> statement-breakpoint
CREATE INDEX `idx_decisions_parent` ON `moderation_decisions` (`parent_id`);--> statement-breakpoint
CREATE INDEX `idx_decisions_created` ON `moderation_decisions` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_decisions_open_contests` ON `moderation_decisions` (`contested_at`) WHERE "moderation_decisions"."contested_at" IS NOT NULL AND "moderation_decisions"."contest_resolved_at" IS NULL;--> statement-breakpoint
-- reports.reporter_id becomes nullable (public reports). Nothing references reports, so the rebuild
-- triggers no foreign key actions on D1.
CREATE TABLE `__new_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`reporter_id` text,
	`source` text DEFAULT 'member' NOT NULL,
	`reporter_email` text,
	`reason` text NOT NULL,
	`note` text,
	`good_faith` integer,
	`counts` integer NOT NULL,
	`outcome` text,
	`decided_at` integer,
	`decision_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reporter_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`decision_id`) REFERENCES `moderation_decisions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_reports` (`id`, `product_id`, `reporter_id`, `source`, `reason`, `note`, `counts`, `outcome`, `created_at`)
  SELECT `id`, `product_id`, `reporter_id`, 'member', `reason`, `note`, `counts`, `outcome`, `created_at` FROM `reports`;--> statement-breakpoint
DROP TABLE `reports`;--> statement-breakpoint
ALTER TABLE `__new_reports` RENAME TO `reports`;--> statement-breakpoint
CREATE UNIQUE INDEX `uq_reports_product_reporter` ON `reports` (`product_id`,`reporter_id`);--> statement-breakpoint
CREATE INDEX `idx_reports_reporter` ON `reports` (`reporter_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_reports_created` ON `reports` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_reports_email_retention` ON `reports` (`decided_at`) WHERE "reports"."reporter_email" IS NOT NULL;

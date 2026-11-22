CREATE TABLE `email_usage` (
	`day` integer PRIMARY KEY NOT NULL,
	`sent` integer DEFAULT 0 NOT NULL,
	`deferred` integer DEFAULT 0 NOT NULL,
	`failed` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `site_state` (
	`id` integer PRIMARY KEY NOT NULL,
	`makers_invited_at` integer,
	`launched_at` integer
);
--> statement-breakpoint
CREATE TABLE `waitlist` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`role` text NOT NULL,
	`interests` text DEFAULT '[]' NOT NULL,
	`product_url` text,
	`utm_source` text,
	`utm_medium` text,
	`utm_campaign` text,
	`utm_content` text,
	`found_via` text,
	`ref_code` text NOT NULL,
	`referred_by` text,
	`confirmed_at` integer,
	`confirmation_queued` integer DEFAULT false NOT NULL,
	`confirmation_sent_at` integer,
	`email_failed_at` integer,
	`email_error` text,
	`invited_at` integer,
	`unsubscribed_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`referred_by`) REFERENCES `waitlist`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `waitlist_email_unique` ON `waitlist` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `waitlist_ref_code_unique` ON `waitlist` (`ref_code`);--> statement-breakpoint
CREATE INDEX `idx_waitlist_referred_by` ON `waitlist` (`referred_by`) WHERE "waitlist"."referred_by" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_waitlist_confirmed` ON `waitlist` (`confirmed_at`) WHERE "waitlist"."confirmed_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_waitlist_pending` ON `waitlist` (`confirmation_sent_at`) WHERE "waitlist"."confirmed_at" IS NULL;--> statement-breakpoint
CREATE INDEX `idx_waitlist_queued` ON `waitlist` (`created_at`) WHERE "waitlist"."confirmation_queued" = 1;--> statement-breakpoint
CREATE INDEX `idx_waitlist_invites` ON `waitlist` (`role`,`invited_at`) WHERE "waitlist"."confirmed_at" IS NOT NULL AND "waitlist"."unsubscribed_at" IS NULL;--> statement-breakpoint
-- The single row the admin "Invite makers" and "Launch" actions update.
INSERT INTO `site_state` (`id`) VALUES (1);

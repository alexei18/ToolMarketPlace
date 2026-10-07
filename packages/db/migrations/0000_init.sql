CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_account_user` ON `account` (`user_id`);--> statement-breakpoint
CREATE TABLE `blocked_domains` (
	`hostname` text PRIMARY KEY NOT NULL,
	`reason` text
);
--> statement-breakpoint
CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`sort_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_slug_unique` ON `categories` (`slug`);--> statement-breakpoint
CREATE TABLE `domains` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`hostname` text NOT NULL,
	`token` text NOT NULL,
	`method` text,
	`verified_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `domains_hostname_unique` ON `domains` (`hostname`);--> statement-breakpoint
CREATE INDEX `idx_domains_user` ON `domains` (`user_id`);--> statement-breakpoint
CREATE TABLE `feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`body` text NOT NULL,
	`is_public` integer NOT NULL,
	`maker_reply` text,
	`resolved_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_feedback_product` ON `feedback` (`product_id`,"created_at" DESC);--> statement-breakpoint
CREATE INDEX `idx_feedback_user` ON `feedback` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`payload` text NOT NULL,
	`read_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_notif_user` ON `notifications` (`user_id`,"created_at" DESC);--> statement-breakpoint
CREATE TABLE `perk_claims` (
	`perk_id` text NOT NULL,
	`user_id` text NOT NULL,
	`code_id` text,
	`claimed_at` integer NOT NULL,
	PRIMARY KEY(`perk_id`, `user_id`),
	FOREIGN KEY (`perk_id`) REFERENCES `perks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`code_id`) REFERENCES `perk_codes`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_perk_claims_user` ON `perk_claims` (`user_id`,`claimed_at`);--> statement-breakpoint
CREATE TABLE `perk_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`perk_id` text NOT NULL,
	`code` text NOT NULL,
	`claimed_by` text,
	`claimed_at` integer,
	FOREIGN KEY (`perk_id`) REFERENCES `perks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`claimed_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_perk_codes_free` ON `perk_codes` (`perk_id`,`claimed_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_perk_codes_code` ON `perk_codes` (`perk_id`,`code`);--> statement-breakpoint
CREATE TABLE `perks` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`details` text,
	`shared_code` text,
	`redeem_url` text,
	`max_claims` integer,
	`claim_count` integer DEFAULT 0 NOT NULL,
	`expires_at` integer,
	`active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_perks_product` ON `perks` (`product_id`);--> statement-breakpoint
CREATE TABLE `product_categories` (
	`product_id` text NOT NULL,
	`category_id` text NOT NULL,
	`published_at` integer NOT NULL,
	PRIMARY KEY(`product_id`, `category_id`),
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_pc_cat_pub` ON `product_categories` (`category_id`,"published_at" DESC);--> statement-breakpoint
CREATE TABLE `product_images` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`r2_key` text NOT NULL,
	`width` integer,
	`height` integer,
	`source` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_images_product` ON `product_images` (`product_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`maker_id` text NOT NULL,
	`domain_id` text NOT NULL,
	`slug` text NOT NULL,
	`url` text NOT NULL,
	`url_normalized` text NOT NULL,
	`title` text NOT NULL,
	`tagline` text NOT NULL,
	`description` text NOT NULL,
	`stage` text NOT NULL,
	`pricing` text NOT NULL,
	`feedback_mode` text DEFAULT 'off' NOT NULL,
	`roadmap_enabled` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'live' NOT NULL,
	`valid_report_count` integer DEFAULT 0 NOT NULL,
	`view_count` integer DEFAULT 0 NOT NULL,
	`click_count` integer DEFAULT 0 NOT NULL,
	`save_count` integer DEFAULT 0 NOT NULL,
	`published_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`maker_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`domain_id`) REFERENCES `domains`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `products_slug_unique` ON `products` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `products_url_normalized_unique` ON `products` (`url_normalized`);--> statement-breakpoint
CREATE INDEX `idx_products_status_pub` ON `products` (`status`,"published_at" DESC);--> statement-breakpoint
CREATE INDEX `idx_products_maker` ON `products` (`maker_id`);--> statement-breakpoint
CREATE TABLE `push_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `push_subscriptions_endpoint_unique` ON `push_subscriptions` (`endpoint`);--> statement-breakpoint
CREATE INDEX `idx_push_user` ON `push_subscriptions` (`user_id`);--> statement-breakpoint
CREATE TABLE `reports` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`reporter_id` text NOT NULL,
	`reason` text NOT NULL,
	`note` text,
	`counts` integer NOT NULL,
	`outcome` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reporter_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_reports_product_reporter` ON `reports` (`product_id`,`reporter_id`);--> statement-breakpoint
CREATE INDEX `idx_reports_reporter` ON `reports` (`reporter_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `roadmap_items` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'planned' NOT NULL,
	`vote_count` integer DEFAULT 0 NOT NULL,
	`from_feedback_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`from_feedback_id`) REFERENCES `feedback`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_roadmap_product` ON `roadmap_items` (`product_id`);--> statement-breakpoint
CREATE TABLE `roadmap_votes` (
	`item_id` text NOT NULL,
	`user_id` text NOT NULL,
	PRIMARY KEY(`item_id`, `user_id`),
	FOREIGN KEY (`item_id`) REFERENCES `roadmap_items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_roadmap_votes_user` ON `roadmap_votes` (`user_id`);--> statement-breakpoint
CREATE TABLE `saves` (
	`user_id` text NOT NULL,
	`product_id` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `product_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_saves_user` ON `saves` (`user_id`,"created_at" DESC);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX `idx_session_user` ON `session` (`user_id`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`username` text,
	`bio` text,
	`role` text DEFAULT 'user' NOT NULL,
	`banned_at` integer,
	`digest_frequency` text DEFAULT 'weekly' NOT NULL,
	`last_digest_at` integer,
	`onboarded_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_username_unique` ON `user` (`username`);--> statement-breakpoint
CREATE INDEX `idx_user_digest` ON `user` (`digest_frequency`,`last_digest_at`);--> statement-breakpoint
CREATE TABLE `user_interests` (
	`user_id` text NOT NULL,
	`category_id` text NOT NULL,
	PRIMARY KEY(`user_id`, `category_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_verification_identifier` ON `verification` (`identifier`);
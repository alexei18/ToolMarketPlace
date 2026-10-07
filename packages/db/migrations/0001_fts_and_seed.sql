-- Full-text search over products.
-- The index keeps its own copy of the text keyed by product_id instead of using
-- content='products': products has a TEXT primary key, so its implicit rowid is not
-- guaranteed to be stable, and an external-content index keyed on it could drift.
CREATE VIRTUAL TABLE `products_fts` USING fts5(
  product_id UNINDEXED,
  title,
  tagline,
  description,
  tokenize = 'unicode61 remove_diacritics 2',
  prefix = '2 3'
);
--> statement-breakpoint
CREATE TRIGGER `products_fts_ai` AFTER INSERT ON `products` BEGIN
  INSERT INTO products_fts (product_id, title, tagline, description)
  VALUES (new.id, new.title, new.tagline, new.description);
END;
--> statement-breakpoint
CREATE TRIGGER `products_fts_ad` AFTER DELETE ON `products` BEGIN
  DELETE FROM products_fts WHERE product_id = old.id;
END;
--> statement-breakpoint
CREATE TRIGGER `products_fts_au` AFTER UPDATE OF title, tagline, description ON `products` BEGIN
  DELETE FROM products_fts WHERE product_id = old.id;
  INSERT INTO products_fts (product_id, title, tagline, description)
  VALUES (new.id, new.title, new.tagline, new.description);
END;
--> statement-breakpoint
-- Keep the copied published_at in product_categories in sync.
CREATE TRIGGER `products_pc_published_au` AFTER UPDATE OF published_at ON `products` BEGIN
  UPDATE product_categories SET published_at = new.published_at WHERE product_id = new.id;
END;
--> statement-breakpoint
-- The 20 launch categories (packages/shared/src/categories.ts).
INSERT INTO `categories` (id, slug, name, description, sort_order) VALUES
  ('c_ai', 'ai', 'AI', 'Assistants, agents, models and tools built on AI.', 10),
  ('c_developer-tools', 'developer-tools', 'Developer Tools', 'APIs, libraries, CLIs, hosting and everything for shipping code.', 20),
  ('c_productivity', 'productivity', 'Productivity', 'Notes, tasks, calendars and tools that save you time.', 30),
  ('c_design', 'design', 'Design', 'Design tools, assets, mockups and creative software.', 40),
  ('c_marketing', 'marketing', 'Marketing', 'SEO, social media, email and growth tools.', 50),
  ('c_sales', 'sales', 'Sales & CRM', 'Pipelines, outreach, CRMs and sales automation.', 60),
  ('c_writing', 'writing', 'Writing', 'Editors, blogging, copywriting and publishing.', 70),
  ('c_video', 'video', 'Video', 'Recording, editing, streaming and video hosting.', 80),
  ('c_audio', 'audio', 'Audio & Music', 'Podcasting, music making, transcription and sound.', 90),
  ('c_finance', 'finance', 'Finance', 'Budgeting, invoicing, accounting and investing.', 100),
  ('c_education', 'education', 'Education', 'Courses, learning apps and tools for teachers.', 110),
  ('c_health', 'health', 'Health & Fitness', 'Workouts, habits, sleep, nutrition and wellbeing.', 120),
  ('c_no-code', 'no-code', 'No-Code', 'Build sites, apps and automations without code.', 130),
  ('c_analytics', 'analytics', 'Analytics & Data', 'Dashboards, tracking, BI and data pipelines.', 140),
  ('c_collaboration', 'collaboration', 'Collaboration', 'Chat, meetings, docs and remote teamwork.', 150),
  ('c_customer-support', 'customer-support', 'Customer Support', 'Help desks, live chat and knowledge bases.', 160),
  ('c_ecommerce', 'ecommerce', 'E-commerce', 'Online stores, payments and selling tools.', 170),
  ('c_security', 'security', 'Security & Privacy', 'Passwords, VPNs, monitoring and privacy tools.', 180),
  ('c_hr', 'hr', 'HR & Recruiting', 'Hiring, onboarding, payroll and people ops.', 190),
  ('c_games', 'games', 'Games & Fun', 'Games, toys and delightful side projects.', 200);

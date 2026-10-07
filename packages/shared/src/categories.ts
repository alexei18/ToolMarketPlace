export interface CategorySeed {
  slug: string;
  name: string;
  description: string;
}

/**
 * The launch set of 20 categories. Admins can rename, reorder or add categories later;
 * this list only seeds the database (see packages/db/migrations).
 */
export const CATEGORY_SEED: readonly CategorySeed[] = [
  { slug: "ai", name: "AI", description: "Assistants, agents, models and tools built on AI." },
  { slug: "developer-tools", name: "Developer Tools", description: "APIs, libraries, CLIs, hosting and everything for shipping code." },
  { slug: "productivity", name: "Productivity", description: "Notes, tasks, calendars and tools that save you time." },
  { slug: "design", name: "Design", description: "Design tools, assets, mockups and creative software." },
  { slug: "marketing", name: "Marketing", description: "SEO, social media, email and growth tools." },
  { slug: "sales", name: "Sales & CRM", description: "Pipelines, outreach, CRMs and sales automation." },
  { slug: "writing", name: "Writing", description: "Editors, blogging, copywriting and publishing." },
  { slug: "video", name: "Video", description: "Recording, editing, streaming and video hosting." },
  { slug: "audio", name: "Audio & Music", description: "Podcasting, music making, transcription and sound." },
  { slug: "finance", name: "Finance", description: "Budgeting, invoicing, accounting and investing." },
  { slug: "education", name: "Education", description: "Courses, learning apps and tools for teachers." },
  { slug: "health", name: "Health & Fitness", description: "Workouts, habits, sleep, nutrition and wellbeing." },
  { slug: "no-code", name: "No-Code", description: "Build sites, apps and automations without code." },
  { slug: "analytics", name: "Analytics & Data", description: "Dashboards, tracking, BI and data pipelines." },
  { slug: "collaboration", name: "Collaboration", description: "Chat, meetings, docs and remote teamwork." },
  { slug: "customer-support", name: "Customer Support", description: "Help desks, live chat and knowledge bases." },
  { slug: "ecommerce", name: "E-commerce", description: "Online stores, payments and selling tools." },
  { slug: "security", name: "Security & Privacy", description: "Passwords, VPNs, monitoring and privacy tools." },
  { slug: "hr", name: "HR & Recruiting", description: "Hiring, onboarding, payroll and people ops." },
  { slug: "games", name: "Games & Fun", description: "Games, toys and delightful side projects." },
];

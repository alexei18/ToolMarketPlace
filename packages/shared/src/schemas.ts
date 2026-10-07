import { z } from "zod";
import {
  DESCRIPTION_MAX,
  FEEDBACK_MAX,
  INTERESTS_MIN,
  PRODUCT_CATEGORIES_MAX,
  PRODUCT_CATEGORIES_MIN,
  REPLY_MAX,
  TAGLINE_MAX,
  TITLE_MAX,
} from "./limits";

import { DOMAIN_METHODS, DIGEST_FREQUENCIES, FEEDBACK_MODES, FEEDBACK_TYPES, PERK_TYPES, PRICING, REPORT_REASONS, ROADMAP_STATUSES, STAGES } from "./enums";

const text = (max: number) => z.string().trim().min(1).max(max);
const slug = z.string().trim().min(1).max(80).regex(/^[a-z0-9-]+$/);

export const turnstileField = { turnstileToken: z.string().max(4096).optional() };

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(30)
  .regex(/^[a-z0-9_]+$/, "Use letters, numbers and underscores only");

export const interestsSchema = z.object({
  categories: z.array(slug).min(INTERESTS_MIN).max(20),
});

export const settingsSchema = z
  .object({
    name: z.string().trim().min(1).max(60),
    username: usernameSchema,
    digestFrequency: z.enum(DIGEST_FREQUENCIES),
    bio: z.string().trim().max(160),
  })
  .partial();

export const pushSubscriptionSchema = z.object({
  endpoint: z.url().max(2048),
  keys: z.object({ p256dh: z.string().min(1).max(256), auth: z.string().min(1).max(128) }),
});

export const domainCreateSchema = z.object({ domain: z.string().trim().min(3).max(253) });
export const domainVerifySchema = z.object({ method: z.enum(DOMAIN_METHODS) });

export const productPreviewSchema = z.object({ url: z.string().trim().min(4).max(2048), ...turnstileField });

export const productImageInput = z.object({
  /** r2 key returned by the preview or upload endpoint */
  key: z.string().min(1).max(200).regex(/^[a-z0-9/_.-]+$/),
});

const productFields = {
  title: text(TITLE_MAX),
  tagline: text(TAGLINE_MAX),
  description: text(DESCRIPTION_MAX),
  categories: z.array(slug).min(PRODUCT_CATEGORIES_MIN).max(PRODUCT_CATEGORIES_MAX),
  stage: z.enum(STAGES),
  pricing: z.enum(PRICING),
  feedbackMode: z.enum(FEEDBACK_MODES),
  roadmapEnabled: z.boolean(),
  images: z.array(productImageInput).max(6),
};

export const productCreateSchema = z.object({
  ...productFields,
  url: z.string().trim().min(4).max(2048),
  feedbackMode: productFields.feedbackMode.default("off"),
  roadmapEnabled: productFields.roadmapEnabled.default(false),
  images: productFields.images.default([]),
});

/** Every field optional and without defaults, so a PATCH only touches what it sends. */
export const productUpdateSchema = z.object(productFields).partial();

export const perkInputSchema = z
  .object({
    id: z.string().max(40).optional(),
    type: z.enum(PERK_TYPES),
    title: text(80),
    details: z.string().trim().max(500).optional().nullable(),
    sharedCode: z.string().trim().max(80).optional().nullable(),
    redeemUrl: z.url().max(2048).optional().nullable(),
    maxClaims: z.number().int().positive().max(1_000_000).optional().nullable(),
    expiresAt: z.number().int().positive().optional().nullable(),
    active: z.boolean().default(true),
    /** New codes to append for `unique_codes` perks (one per entry). */
    codes: z.array(z.string().trim().min(1).max(120)).max(5000).optional(),
  })
  .superRefine((p, ctx) => {
    if (p.type === "coupon" && !p.sharedCode) {
      ctx.addIssue({ code: "custom", path: ["sharedCode"], message: "A coupon needs a code" });
    }
    if (p.redeemUrl && !/^https:\/\//i.test(p.redeemUrl)) {
      ctx.addIssue({ code: "custom", path: ["redeemUrl"], message: "Use an https link" });
    }
  });

export const perksPutSchema = z.object({ perks: z.array(perkInputSchema).max(10) });

export const feedbackCreateSchema = z.object({
  type: z.enum(FEEDBACK_TYPES),
  body: text(FEEDBACK_MAX),
  ...turnstileField,
});

export const feedbackReplySchema = z.object({ reply: text(REPLY_MAX) });

export const roadmapItemCreateSchema = z.object({
  title: text(120),
  description: z.string().trim().max(1000).optional().nullable(),
  status: z.enum(ROADMAP_STATUSES).default("planned"),
  fromFeedbackId: z.string().max(40).optional().nullable(),
});

export const roadmapItemUpdateSchema = z.object({
  title: text(120).optional(),
  description: z.string().trim().max(1000).optional().nullable(),
  status: z.enum(ROADMAP_STATUSES).optional(),
});

export const reportCreateSchema = z.object({
  reason: z.enum(REPORT_REASONS),
  note: z.string().trim().max(500).optional().nullable(),
  ...turnstileField,
});

export const perkClaimSchema = z.object({ ...turnstileField });

export const searchQuerySchema = z.object({
  q: z.string().trim().max(100).default(""),
  stage: z.enum(STAGES).optional(),
  pricing: z.enum(PRICING).optional(),
  perk: z.stringbool().optional(),
  feedback: z.stringbool().optional(),
  category: slug.optional(),
  cursor: z.string().max(200).optional(),
});

export const categoryUpsertSchema = z.object({
  slug,
  name: text(40),
  description: z.string().trim().max(200).optional().nullable(),
  sortOrder: z.number().int().min(0).max(1000).optional(),
});

export const blockedDomainSchema = z.object({
  hostname: z.string().trim().min(3).max(253),
  reason: z.string().trim().max(200).optional().nullable(),
});

export const banSchema = z.object({ reason: z.string().trim().max(200).optional() });

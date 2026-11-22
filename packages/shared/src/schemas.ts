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

import {
  CONTEST_OUTCOMES,
  DOMAIN_METHODS,
  DIGEST_FREQUENCIES,
  FEEDBACK_MODES,
  FEEDBACK_TYPES,
  FOUND_VIA,
  MEMBER_REPORT_REASONS,
  PERK_TYPES,
  PLATFORMS,
  PRICING,
  PUBLIC_REPORT_REASONS,
  RANK_SORTS,
  ROADMAP_STATUSES,
  STAGES,
  WAITLIST_ROLES,
} from "./enums";
import { MODERATION_RULE_IDS } from "./moderation";
import { WAITLIST_INTERESTS_MAX } from "./prelaunch/config";

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

/** Accepting the Terms: the version shown to the user (TERMS_VERSION). */
export const termsAcceptSchema = z.object({ version: z.string().max(20) });

/** First-touch source (docs/PRELAUNCH.md): the utm_* params of the link that brought a new account. */
const utmValue = z.string().trim().min(1).max(100).nullish();
export const firstTouchSchema = z
  .object({ source: utmValue, campaign: utmValue, content: utmValue })
  .refine((v) => v.source || v.campaign || v.content, { message: "Send at least one utm_* value." });

/** Joining the waitlist (docs/tiktok-campaign.md). Category ids are checked against the database. */
export const waitlistJoinSchema = z
  .object({
    email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
    role: z.enum(WAITLIST_ROLES),
    interests: z.array(z.string().max(40)).max(WAITLIST_INTERESTS_MAX).default([]),
    productUrl: z.string().trim().max(2048).nullish(),
    foundVia: z.enum(FOUND_VIA).nullish(),
    utm: z.object({ source: utmValue, medium: utmValue, campaign: utmValue, content: utmValue }).partial().nullish(),
    ref: z.string().trim().max(32).nullish(),
    turnstileToken: z.string().max(4096).nullish(),
  })
  .refine((v) => v.role === "explorer" || v.interests.length <= 1, { path: ["interests"], message: "Pick one category." });

export const waitlistTokenSchema = z.object({ token: z.string().min(10).max(512) });

/** The two admin waitlist actions are typed out to confirm. */
export const WAITLIST_INVITE_CONFIRM = "INVITE";
export const WAITLIST_LAUNCH_CONFIRM = "LAUNCH";

/** Deleting the account: the user types DELETE to confirm. */
export const ACCOUNT_DELETE_CONFIRM = "DELETE";
export const accountDeleteSchema = z.object({ confirm: z.literal(ACCOUNT_DELETE_CONFIRM) });

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
  hasAi: z.boolean(),
  platforms: z
    .array(z.enum(PLATFORMS))
    .min(1, "Pick at least one platform")
    .max(PLATFORMS.length)
    .refine((p) => new Set(p).size === p.length, "Each platform once"),
};

export const productCreateSchema = z.object({
  ...productFields,
  url: z.string().trim().min(4).max(2048),
  feedbackMode: productFields.feedbackMode.default("off"),
  roadmapEnabled: productFields.roadmapEnabled.default(false),
  images: productFields.images.default([]),
  hasAi: productFields.hasAi.default(false),
  platforms: productFields.platforms.default(["web"]),
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
  reason: z.enum(MEMBER_REPORT_REASONS),
  note: z.string().trim().max(500).optional().nullable(),
  ...turnstileField,
});

/** The public /report form, usable without an account (docs/LEGAL.md). */
export const publicReportSchema = z.object({
  url: z.string().trim().min(4).max(2048),
  reason: z.enum(PUBLIC_REPORT_REASONS),
  explanation: z.string().trim().min(20).max(2000),
  email: z.union([z.email().trim().toLowerCase().max(254), z.literal("")]).optional().nullable(),
  goodFaith: z.literal(true, { error: "Confirm that your report is accurate and made in good faith." }),
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

/** Feed, category and "all" lists: the view (Top this week, Trending, New) and the filters. */
export const listQuerySchema = z.object({
  sort: z.enum(RANK_SORTS).default("top"),
  ai: z.stringbool().optional(),
  pricing: z.enum(PRICING).optional(),
  stage: z.enum(STAGES).optional(),
  perk: z.stringbool().optional(),
  platform: z.enum(PLATFORMS).optional(),
  cursor: z.string().max(200).optional(),
});

export const staffPickSchema = z.object({ note: z.string().trim().min(1).max(140) });

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

/** What an admin states when removing a product or suspending an account (the statement of reasons). */
export const decisionInputSchema = z.object({ rule: z.enum(MODERATION_RULE_IDS), facts: z.string().trim().min(10).max(2000) });
export const banSchema = decisionInputSchema;

export const contestSchema = z.object({ body: z.string().trim().min(20).max(2000) });
export const contestResolveSchema = z.object({ outcome: z.enum(CONTEST_OUTCOMES), response: z.string().trim().min(10).max(2000) });

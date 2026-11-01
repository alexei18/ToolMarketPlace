import type {
  ContestOutcome,
  DecisionAction,
  DecisionTarget,
  DecisionTrigger,
  DigestFrequency,
  DomainMethod,
  FeedbackMode,
  FeedbackType,
  NotificationType,
  PerkType,
  Platform,
  Pricing,
  ProductStatus,
  ReportReason,
  ReportSource,
  ReviewCaseKind,
  RoadmapStatus,
  Stage,
} from "./enums";
import type { ModerationRule } from "./moderation";

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
  /** True when the list was cut short because the viewer has no account. */
  limited?: boolean;
  /** Where an account continues after these items (cached visitor pages hand it to "Load more"). */
  resumeCursor?: string | null;
}

export interface CategoryDTO {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  sortOrder: number;
  productCount?: number;
  /** False in pre-launch while the category has fewer than CATEGORY_MIN_ELIGIBLE quality products */
  listed?: boolean;
}

export interface CategoryRef {
  slug: string;
  name: string;
}

export interface UserRef {
  id: string;
  username: string | null;
  name: string;
  image: string | null;
}

export interface ImageDTO {
  id?: string;
  key: string;
  url: string;
  width: number | null;
  height: number | null;
}

export interface ProductCardDTO {
  id: string;
  slug: string;
  title: string;
  tagline: string;
  url: string;
  image: ImageDTO | null;
  stage: Stage;
  pricing: Pricing;
  categories: CategoryRef[];
  publishedAt: number;
  hasPerk: boolean;
  feedbackMode: FeedbackMode;
  roadmapEnabled: boolean;
  saveCount: number;
  hasAi: boolean;
  platforms: Platform[];
  /** An active staff pick (docs/RANKING.md) */
  staffPick: boolean;
  /** Shown in a Top list's "Just launched" slot */
  justLaunched?: boolean;
  /** Set once pre-launch mode records founding makers (docs/PRELAUNCH.md) */
  foundingMaker?: boolean;
  maker: UserRef;
}

export interface PerkPublicDTO {
  id: string;
  type: PerkType;
  title: string;
  details: string | null;
  expiresAt: number | null;
  /** null = unlimited */
  remaining: number | null;
  available: boolean;
  /** Only filled for the viewer who claimed the perk. */
  claimed?: boolean;
  code?: string | null;
  redeemUrl?: string | null;
}

export interface ProductDetailDTO extends ProductCardDTO {
  description: string;
  descriptionHtml: string;
  images: ImageDTO[];
  perks: PerkPublicDTO[];
  hostname: string;
  status: ProductStatus;
  updatedAt: number;
  /** The team's note while the staff pick is active */
  staffPickNote: string | null;
}

export interface ViewerProductStateDTO {
  saved: boolean;
  perks: PerkPublicDTO[];
  reported: boolean;
  isOwner: boolean;
  votes: string[];
}

export interface FeedbackDTO {
  id: string;
  productId: string;
  type: FeedbackType;
  body: string;
  isPublic: boolean;
  makerReply: string | null;
  resolvedAt: number | null;
  createdAt: number;
  /** Null when the author deleted their account (shown as "Deleted user"). */
  author: UserRef | null;
  roadmapItemId?: string | null;
}

export interface RoadmapItemDTO {
  id: string;
  productId: string;
  title: string;
  description: string | null;
  status: RoadmapStatus;
  voteCount: number;
  createdAt: number;
  fromFeedbackId: string | null;
  voted?: boolean;
}

export interface NotificationDTO {
  id: string;
  type: NotificationType;
  payload: NotificationPayload;
  readAt: number | null;
  createdAt: number;
}

export type NotificationPayload =
  | {
      kind: "digest";
      frequency: "daily" | "weekly";
      /** Weekly digests come one per category */
      category?: CategoryRef;
      products: { slug: string; title: string; tagline: string }[];
    }
  | { kind: "feedback_reply"; productSlug: string; productTitle: string; feedbackId: string; reply: string }
  | { kind: "roadmap_shipped"; productSlug: string; productTitle: string; itemTitle: string }
  | { kind: "system"; title: string; body: string; href?: string }
  /** Sent once to every reserved account on launch day (docs/PRELAUNCH.md) */
  | { kind: "launch"; products: { slug: string; title: string; tagline: string }[] };

export interface MeDTO {
  id: string;
  email: string;
  emailVerified: boolean;
  name: string;
  image: string | null;
  username: string | null;
  bio: string | null;
  role: "user" | "admin";
  digestFrequency: DigestFrequency;
  onboarded: boolean;
  /** TERMS_VERSION the user last accepted; null = never (docs/LEGAL.md). */
  termsVersion: string | null;
  isMaker: boolean;
  /** Pre-launch mode (docs/PRELAUNCH.md) */
  prelaunch: boolean;
  interests: string[];
  unreadNotifications: number;
  createdAt: number;
}

export interface DomainDTO {
  id: string;
  hostname: string;
  token: string;
  method: DomainMethod | null;
  verifiedAt: number | null;
  createdAt: number;
  dnsName: string;
  dnsValue: string;
  metaTag: string;
}

export interface PreviewImageDTO extends ImageDTO {
  source: "og" | "screenshot" | "upload";
}

export interface ProductPreviewDTO {
  url: string;
  normalizedUrl: string;
  hostname: string;
  title: string;
  tagline: string;
  description: string;
  images: PreviewImageDTO[];
}

export interface MakerProductDTO extends ProductCardDTO {
  status: ProductStatus;
  viewCount: number;
  clickCount: number;
  validReportCount: number;
}

export interface MakerProductDetailDTO extends ProductDetailDTO {
  viewCount: number;
  clickCount: number;
  perksFull: PerkMakerDTO[];
  quality: QualityChecksDTO;
}

/** The conditions for Top, Trending and the digest. The numeric score is never sent. */
export interface QualityChecksDTO {
  link: boolean;
  image: boolean;
  description: boolean;
  tagline: boolean;
  noOpenReview: boolean;
}

export interface PerkMakerDTO {
  id: string;
  type: PerkType;
  title: string;
  details: string | null;
  sharedCode: string | null;
  redeemUrl: string | null;
  maxClaims: number | null;
  claimCount: number;
  expiresAt: number | null;
  active: boolean;
  codesTotal: number;
  codesLeft: number;
}

export interface StatsDTO {
  views: number;
  clicks: number;
  saves: number;
  perkClaims: number;
  feedback: number;
  roadmapVotes: number;
}

export interface ClaimedPerkDTO {
  perkId: string;
  title: string;
  type: PerkType;
  code: string | null;
  redeemUrl: string | null;
  claimedAt: number;
  expiresAt: number | null;
  product: { slug: string; title: string; image: ImageDTO | null };
}

/** An available perk on the public /perks page: no codes or redeem links, claiming happens on the product page. */
export interface PublicPerkDTO {
  perkId: string;
  title: string;
  type: PerkType;
  expiresAt: number | null;
  product: { slug: string; title: string; image: ImageDTO | null };
}

/** A category's weekly archive: that week's quality launches, best score first. */
export interface WeekArchiveDTO {
  category: CategoryRef;
  week: { slug: string; year: number; week: number };
  items: ProductCardDTO[];
  /** The closest earlier week that has an archive */
  previous: { slug: string; year: number; week: number } | null;
}

export interface ReviewQueueItemDTO {
  product: MakerProductDTO;
  reports: {
    id: string;
    reason: ReportReason;
    note: string | null;
    counts: boolean;
    createdAt: number;
    source: ReportSource;
    /** Null for public reports. */
    reporter: UserRef | null;
    reporterEmail: string | null;
  }[];
}

export interface ReviewCaseDTO {
  id: string;
  kind: ReviewCaseKind;
  details: { total: number; young: number; windowHours: number };
  createdAt: number;
  product: ProductCardDTO;
}

export interface StaffPickDTO {
  product: ProductCardDTO;
  note: string | null;
  pickedAt: number;
  expiresAt: number;
}

export interface MakerProfileDTO {
  user: UserRef & { bio: string | null; createdAt: number };
  products: ProductCardDTO[];
}

export interface HomeDTO {
  /** Pre-launch mode (docs/PRELAUNCH.md) */
  prelaunch: boolean;
  /** Top this week, or null while fewer than HOME_TOP_MIN quality products exist */
  top: ProductCardDTO[] | null;
  /** Reserved accounts, only in pre-launch and from RESERVED_COUNT_MIN */
  reservedCount: number | null;
  categories: CategoryDTO[];
}

/** A statement of reasons, as the affected user sees it. */
export interface DecisionDTO {
  id: string;
  targetType: DecisionTarget;
  action: DecisionAction;
  trigger: DecisionTrigger;
  automated: boolean;
  rule: ModerationRule;
  facts: string;
  createdAt: number;
  reversedAt: number | null;
  /** Product decisions: the product (null once it was deleted). */
  product: { id: string; slug: string; title: string } | null;
  /** Set when a product was hidden because its maker's account was suspended. */
  parentId: string | null;
  contest: { body: string; contestedAt: number; outcome: ContestOutcome | null; response: string | null; resolvedAt: number | null } | null;
  /** Last moment it can be contested; null when it can't be (already contested, reversed, or covered by the suspension). */
  contestUntil: number | null;
}

export interface AdminDecisionDTO extends DecisionDTO {
  user: { id: string; name: string; email: string } | null;
  decidedBy: { id: string; name: string } | null;
  contestResolvedBy: { id: string; name: string } | null;
}

export interface AdminReportDTO {
  id: string;
  reference: string;
  source: ReportSource;
  reason: ReportReason;
  note: string | null;
  reporter: UserRef | null;
  reporterEmail: string | null;
  goodFaith: boolean | null;
  counts: boolean;
  outcome: "upheld" | "rejected" | null;
  decidedAt: number | null;
  createdAt: number;
  product: { id: string; slug: string; title: string; status: ProductStatus };
}

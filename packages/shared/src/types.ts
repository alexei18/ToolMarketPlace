import type {
  DigestFrequency,
  DomainMethod,
  FeedbackMode,
  FeedbackType,
  NotificationType,
  PerkType,
  Pricing,
  ProductStatus,
  ReportReason,
  RoadmapStatus,
  Stage,
} from "./schemas";

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
  /** True when the list was cut short because the viewer has no account. */
  limited?: boolean;
}

export interface CategoryDTO {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  sortOrder: number;
  productCount?: number;
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
  author: UserRef;
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
  | { kind: "digest"; frequency: "daily" | "weekly"; products: { slug: string; title: string; tagline: string }[] }
  | { kind: "feedback_reply"; productSlug: string; productTitle: string; feedbackId: string; reply: string }
  | { kind: "roadmap_shipped"; productSlug: string; productTitle: string; itemTitle: string }
  | { kind: "system"; title: string; body: string; href?: string };

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
  isMaker: boolean;
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

export interface ReviewQueueItemDTO {
  product: MakerProductDTO;
  reports: {
    id: string;
    reason: ReportReason;
    note: string | null;
    counts: boolean;
    createdAt: number;
    reporter: UserRef;
  }[];
}

export interface MakerProfileDTO {
  user: UserRef & { bio: string | null; createdAt: number };
  products: ProductCardDTO[];
}

export interface HomeDTO {
  today: ProductCardDTO[];
  recent: ProductCardDTO[];
  categories: CategoryDTO[];
}

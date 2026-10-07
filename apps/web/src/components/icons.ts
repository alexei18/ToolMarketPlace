import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  Bell,
  Bookmark,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Copy,
  ExternalLink,
  Flag,
  Gift,
  Globe,
  ImagePlus,
  Info,
  LayoutDashboard,
  Link,
  LogOut,
  Map as MapIcon,
  MessageSquare,
  Plus,
  Search,
  Settings,
  Shield,
  Sparkles,
  Trash2,
  Upload,
  User,
  X,
  type IconNode,
} from "lucide";

export const ICONS = {
  "arrow-left": ArrowLeft,
  "arrow-right": ArrowRight,
  "arrow-up": ArrowUp,
  "arrow-up-right": ArrowUpRight,
  bell: Bell,
  bookmark: Bookmark,
  check: Check,
  "chevron-down": ChevronDown,
  "chevron-left": ChevronLeft,
  "chevron-right": ChevronRight,
  alert: CircleAlert,
  copy: Copy,
  external: ExternalLink,
  flag: Flag,
  gift: Gift,
  globe: Globe,
  "image-plus": ImagePlus,
  info: Info,
  dashboard: LayoutDashboard,
  link: Link,
  logout: LogOut,
  map: MapIcon,
  message: MessageSquare,
  plus: Plus,
  search: Search,
  settings: Settings,
  shield: Shield,
  sparkles: Sparkles,
  trash: Trash2,
  upload: Upload,
  user: User,
  x: X,
} satisfies Record<string, IconNode>;

export type IconName = keyof typeof ICONS;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/** Inline SVG markup for an icon (thin 1.5px line, inherits color). */
export function iconSvg(name: IconName, opts: { size?: number; className?: string; strokeWidth?: number } = {}): string {
  const node = ICONS[name];
  const size = opts.size ?? 16;
  const children = node
    .map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).map(([k, v]) => `${k}="${esc(String(v))}"`).join(" ")}/>`)
    .join("");
  const cls = opts.className ? ` class="${esc(opts.className)}"` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${opts.strokeWidth ?? 1.5}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${cls}>${children}</svg>`;
}

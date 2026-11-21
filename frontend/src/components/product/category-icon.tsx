import {
  Bird,
  BadgeCheck,
  BookOpen,
  CloudRain,
  Cpu,
  FlaskRound,
  Flame,
  Grid3x3,
  Hammer,
  LayoutGrid,
  LayoutPanelTop,
  Map,
  MessageSquareText,
  Mountain,
  Music,
  Shapes,
  Skull,
  Sparkles,
  Sword,
  Swords,
  ToggleRight,
  Type,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";

/**
 * Category.iconKey (lucide name, set by the seed / Admin) → icon component.
 * Plain module (no "use client") so both server and client components can use it.
 */
const ICONS: Record<string, LucideIcon> = {
  "user-round": UserRound,
  mountain: Mountain,
  "grid-3x3": Grid3x3,
  skull: Skull,
  sparkles: Sparkles,
  sword: Sword,
  "flask-round": FlaskRound,
  "layout-panel-top": LayoutPanelTop,
  shapes: Shapes,
  "cloud-rain": CloudRain,
  music: Music,
  type: Type,
  bird: Bird,
  users: Users,
  swords: Swords,
  flame: Flame,
  hammer: Hammer,
  map: Map,
  "toggle-right": ToggleRight,
  "book-open": BookOpen,
  cpu: Cpu,
  // In-page anchors that are not categories.
  overview: LayoutGrid,
  benefits: BadgeCheck,
  reviews: MessageSquareText,
};

export function CategoryIcon({ name, className }: { name: string | null; className?: string }) {
  const Icon = (name && ICONS[name]) || Shapes;
  return <Icon aria-hidden="true" className={className} />;
}

import {
  ChartColumn,
  CircleHelp,
  Gem,
  Gift,
  Info,
  LibraryBig,
  Mail,
  ReceiptText,
  ScrollText,
  ShieldCheck,
  ShoppingBag,
  Store,
  UserRound,
  type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  store: Store,
  gem: Gem,
  gift: Gift,
  library: LibraryBig,
  cart: ShoppingBag,
  info: Info,
  mail: Mail,
  help: CircleHelp,
  scroll: ScrollText,
  shield: ShieldCheck,
  receipt: ReceiptText,
  user: UserRound,
  chart: ChartColumn,
};

/** Icon for an app-nav entry. Plain module so server and client components can both use it. */
export function NavIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICONS[name] ?? Store;
  return <Icon aria-hidden="true" className={className} />;
}

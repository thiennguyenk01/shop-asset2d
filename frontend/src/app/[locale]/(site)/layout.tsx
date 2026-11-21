import { SiteShell } from "@/components/layout/site-shell";

/** Every store page (shop, product, cart, checkout, account, library…) inside the store's dashboard shell. */
export default function SiteLayout({ children }: LayoutProps<"/[locale]">) {
  return <SiteShell>{children}</SiteShell>;
}

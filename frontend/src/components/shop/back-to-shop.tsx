"use client";

import { ArrowLeft } from "lucide-react";
import { useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Link } from "@backend/i18n/navigation";

/**
 * "Back to the shop" from a pack page lands on the SAME list the shopper left: search, filters, sort and
 * page are kept. The shop page remembers its own query in sessionStorage (per tab, a convenience only —
 * without it the button simply opens the shop).
 */
const KEY = "shop:lastQuery";

export function RememberShopQuery({ query }: { query: Record<string, string> }) {
  const value = new URLSearchParams(query).toString();
  useEffect(() => {
    try {
      sessionStorage.setItem(KEY, value);
    } catch {
      // private mode / storage blocked: the back button falls back to /shop
    }
  }, [value]);
  return null;
}

function readStored(): string {
  try {
    const raw = sessionStorage.getItem(KEY) ?? "";
    return raw.length <= 512 ? raw : "";
  } catch {
    return "";
  }
}
const noSubscribe = () => () => {};

/** The remembered shop query (server render / no storage → none, i.e. the plain shop). */
function useLastShopQuery(): Record<string, string> {
  const raw = useSyncExternalStore(noSubscribe, readStored, () => "");
  // Parsed into plain key/values; the link itself is always /shop on this site.
  return useMemo(() => Object.fromEntries(new URLSearchParams(raw)), [raw]);
}

/** Clear button at the top of a pack page. */
export function BackToShopButton({ label }: { label: string }) {
  const query = useLastShopQuery();
  return (
    <Button asChild variant="ghost" size="sm" className="-ml-3 w-fit">
      <Link href={{ pathname: "/shop", query }} data-testid="back-to-shop">
        <ArrowLeft aria-hidden="true" className="size-4" />
        {label}
      </Link>
    </Button>
  );
}

/** The top bar's "Shop" link on pack pages goes to the same remembered list. */
export function ShopCrumbLink({ className, children }: { className?: string; children: ReactNode }) {
  const query = useLastShopQuery();
  return (
    <Link href={{ pathname: "/shop", query }} className={className}>
      {children}
    </Link>
  );
}

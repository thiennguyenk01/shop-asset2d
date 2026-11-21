import { NotFoundContent } from "@/components/layout/not-found-content";
import { SiteShell } from "@/components/layout/site-shell";

/**
 * 404 raised outside the store group (unknown locale, or the Admin gate refusing a non-admin): the store shell
 * is drawn here so it looks exactly like any other "not found" — nothing hints that /admin exists.
 */
export default function NotFound() {
  return (
    <SiteShell>
      <NotFoundContent />
    </SiteShell>
  );
}

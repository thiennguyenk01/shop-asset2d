"use server";

import { refresh } from "next/cache";
import { redirect } from "@backend/i18n/navigation";
import { routing, type Locale } from "@backend/i18n/routing";
import { getSessionUser } from "@backend/auth/guards";
import { completeDemoPayment, type DemoOutcome } from "./demo-gateway";

export type DemoPayState = { status: "idle" | "error" };

const safeLocale = (l: string): Locale => ((routing.locales as readonly string[]).includes(l) ? (l as Locale) : routing.defaultLocale);

/** "Succeed" / "Fail" on the Demo gateway page. The session decides whose payment it is, never the client. */
export async function completeDemoPaymentAction(locale: string, txnId: string, _prev: DemoPayState, form: FormData): Promise<DemoPayState> {
  const loc = safeLocale(locale);
  const outcome = form.get("outcome") as DemoOutcome;
  if (typeof txnId !== "string" || (outcome !== "SUCCEEDED" && outcome !== "FAILED")) return { status: "error" };
  const user = await getSessionUser();
  if (!user) redirect({ href: { pathname: "/login", query: { callbackUrl: `/checkout/demo/${txnId}` } }, locale: loc });
  const done = await completeDemoPayment(txnId, user!.id, outcome);
  if (!done) return { status: "error" };
  // Settled or not, the result page shows the order's real state (it never grants anything itself).
  refresh(); // the layout's cart badge: paid packs just left the cart
  redirect({ href: `/checkout/result/${done.orderCode}`, locale: loc });
  return { status: "idle" };
}

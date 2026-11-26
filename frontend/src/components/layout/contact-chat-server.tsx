import { connection } from "next/server";
import { getContactChannels } from "@backend/modules/settings/service";
import { ContactChat } from "./contact-chat";

/**
 * The chat button with the channels the Admin turned on (user choice 2026-11-26); nothing when there are none.
 * Rendered at request time inside <Suspense> (SiteShell): the list itself is cached (CONTACT_TAG), but no page's
 * static shell depends on it, so an Admin save does not make Next regenerate every shell (a route like
 * /checkout/result/[code] cannot regenerate its shell for an unknown code and answered 500).
 */
export async function ContactChatServer() {
  await connection();
  // A database hiccup only hides the button.
  const channels = await getContactChannels().catch(() => []);
  return channels.length > 0 ? <ContactChat channels={channels} /> : null;
}

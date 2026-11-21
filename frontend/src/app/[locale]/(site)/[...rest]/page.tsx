import { notFound } from "next/navigation";

// This segment always 404s, so it can never render an instant UI. Opt it out of
// Cache Components' instant-navigation validation (otherwise the dev overlay reports
// "Could not validate `instant`…"). The response is still a localized 404.
export const instant = false;

// Unknown paths under a locale render the localized (site)/not-found.tsx inside the store shell.
export default function CatchAll() {
  notFound();
}

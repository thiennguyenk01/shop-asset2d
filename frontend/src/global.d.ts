import type messages from "../messages/vi.json";
import type { routing } from "@backend/i18n/routing";

// Type-safe translations: a key missing from vi.json is a type error.
// `npm run i18n:check` guarantees en.json has exactly the same keys.
declare module "next-intl" {
  interface AppConfig {
    Locale: (typeof routing.locales)[number];
    Messages: typeof messages;
  }
}

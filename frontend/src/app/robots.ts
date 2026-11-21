import type { MetadataRoute } from "next";
import { robotsFor } from "@backend/lib/seo/seo";
import { getEnv } from "@backend/env";

/** /robots.txt (GĐ7.3): crawlable only on the production site; see backend/src/lib/seo/seo.ts. */
export default function robots(): MetadataRoute.Robots {
  const env = getEnv();
  return robotsFor(env.APP_ENV, env.APP_URL);
}

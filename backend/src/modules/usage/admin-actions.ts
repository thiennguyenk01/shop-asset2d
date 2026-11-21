"use server";

import { refresh, updateTag } from "next/cache";
import { requireAdmin } from "@backend/auth/guards";
import { USAGE_TAG } from "./service";

/** "Refresh" on the Admin Usage page: measure again now instead of waiting for the 10-minute cache. */
export async function refreshUsageAction(): Promise<void> {
  await requireAdmin();
  updateTag(USAGE_TAG);
  refresh();
}

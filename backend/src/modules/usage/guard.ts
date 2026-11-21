import "server-only";
import { databaseFull, emailWindows, mailOverFreeQuota, uploadOverFreeStorage } from "@backend/lib/usage/rules";
import { findShopSettings } from "@backend/modules/settings/repository";
import { getStorage } from "@backend/storage";
import { countMailsSince, databaseBytes } from "./repository";

/**
 * "Free plans only" guards (user choice 2026-11-22). While the Admin has not turned the mode off (Settings), the
 * shop adds nothing past the free allowances. Each guard measures fresh (not the Usage page's 10-minute cache):
 * one small query for the database and the mails, a listing of both buckets for an Admin upload.
 */
export async function freeTierOnly(): Promise<boolean> {
  return (await findShopSettings())?.freeTierOnly ?? true;
}

/** R2: refused when the upload would pass 90 % of the allowance, or when the buckets cannot be measured. */
export async function uploadBlockedByFreeTier(addBytes: number): Promise<boolean> {
  if (!(await freeTierOnly())) return false;
  try {
    const storage = getStorage();
    const [pub, priv] = await Promise.all([storage.usage("public"), storage.usage("private")]);
    return uploadOverFreeStorage(pub.bytes + priv.bytes, addBytes);
  } catch {
    return true;
  }
}

/** Neon: no new accounts or orders once the database has reached the allowance (Neon would refuse the writes). */
export async function databaseBlockedByFreeTier(): Promise<boolean> {
  if (!(await freeTierOnly())) return false;
  return databaseFull(await databaseBytes());
}

/**
 * Resend: no mail past 100 a day / 3,000 a month. `alreadyCreated` = this mail's own reset token is already in the
 * count. Only for the real service: the dev outbox costs nothing and tests create many tokens.
 */
export async function mailBlockedByFreeTier(alreadyCreated: number): Promise<boolean> {
  if (!(await freeTierOnly())) return false;
  const w = emailWindows(new Date());
  const [day, month] = await Promise.all([countMailsSince(w.day), countMailsSince(w.month)]);
  return mailOverFreeQuota(day - alreadyCreated, month - alreadyCreated);
}

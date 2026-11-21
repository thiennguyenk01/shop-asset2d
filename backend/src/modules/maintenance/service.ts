import "server-only";
import { expireBefore, guestCartCutoff, orphanUploadCutoff, UPLOAD_PREFIX, type CronJob } from "@backend/lib/cron/rules";
import { rateLimitCutoff } from "@backend/lib/rate-limit/rules";
import { getActiveProvider } from "@backend/modules/payment/providers";
import { deleteRateRowsBefore } from "@backend/modules/rate-limit/repository";
import { getStorage, type Bucket } from "@backend/storage";
import { deleteStaleGuestCarts, findOverduePendingOrders, findReferencedKeys, markOrdersExpired } from "./repository";

/**
 * Scheduled jobs (GĐ6.3). Called by /api/cron/<job> (Vercel Cron once deployed, with CRON_SECRET) and by
 * `npm run cron:run` in development. Every job is safe to run again at any time (idempotent).
 */
/** waitingOrders: overdue, but the gateway says the payment is not over (or could not be asked): kept PENDING. */
export type ReconcileReport = { expiredOrders: number; waitingOrders: number };

/** Orders looked at per run (the job runs again later for the rest). */
const RECONCILE_BATCH = 500;
/** rateLimits: failed-attempt counters older than a day (GĐ7.1). */
export type CleanupReport = { guestCarts: number; orphanUploads: number; rateLimits: number };

/**
 * PENDING orders past their expiry (+ grace) → EXPIRED, after asking the gateway (step 6.4):
 * - the gateway keeps no state (Demo), or says the payment failed / was cancelled → EXPIRED;
 * - still in progress at the gateway (the buyer may still pay), or the gateway cannot be reached → kept PENDING,
 *   asked again on the next run;
 * - paid at the gateway but its signed confirmation never arrived → kept PENDING and logged. The job never
 *   grants anything: only the verified webhook does (docs/ARCHITECTURE.md §4).
 * Orders paid through another gateway than the active one cannot be asked: EXPIRED as before.
 */
export async function reconcileOrders(now = new Date()): Promise<ReconcileReport> {
  const provider = getActiveProvider();
  const overdue = await findOverduePendingOrders(expireBefore(now), RECONCILE_BATCH);
  const expire: string[] = [];
  let waitingOrders = 0;
  for (const order of overdue) {
    const payment = order.payments[0];
    if (!payment || payment.provider !== provider.id || !payment.providerTxnId || payment.status !== "PENDING") {
      expire.push(order.id);
      continue;
    }
    let state;
    try {
      state = await provider.queryStatus(payment.providerTxnId);
    } catch (e) {
      console.warn(`[reconcile] could not ask ${provider.id} about ${order.code}: ${e instanceof Error ? e.message : String(e)}`);
      waitingOrders++;
      continue;
    }
    if (state === null || state === "FAILED" || state === "CANCELLED") {
      expire.push(order.id);
    } else {
      waitingOrders++;
      if (state === "SUCCEEDED") console.warn(`[reconcile] ${order.code}: paid at ${provider.id} but no signed confirmation arrived; kept PENDING`);
    }
  }
  return { expiredOrders: await markOrdersExpired(expire), waitingOrders };
}

export async function cleanupStaleData(now = new Date()): Promise<CleanupReport> {
  const guestCarts = await deleteStaleGuestCarts(guestCartCutoff(now));
  const orphanUploads = await removeOrphanUploads(now);
  const rateLimits = await deleteRateRowsBefore(rateLimitCutoff(now));
  return { guestCarts, orphanUploads, rateLimits };
}

/**
 * Objects under `packs/` (Admin uploads) older than the cut-off that no media / file row refers to. Rows are
 * checked just before removing, so an upload finished in the meantime is kept.
 */
async function removeOrphanUploads(now: Date): Promise<number> {
  const storage = getStorage();
  const cutoff = orphanUploadCutoff(now);
  let removed = 0;
  for (const bucket of ["public", "private"] as const satisfies Bucket[]) {
    const old = (await storage.list(bucket, UPLOAD_PREFIX)).filter((o) => o.modifiedAt < cutoff).map((o) => o.key);
    for (let i = 0; i < old.length; i += 200) {
      const batch = old.slice(i, i + 200);
      const referenced = await findReferencedKeys(batch);
      for (const key of batch) {
        if (referenced.has(key)) continue;
        await storage.remove(bucket, key);
        removed++;
      }
    }
  }
  return removed;
}

export async function runCronJob(job: CronJob, now = new Date()): Promise<ReconcileReport | CleanupReport> {
  return job === "reconcile" ? reconcileOrders(now) : cleanupStaleData(now);
}

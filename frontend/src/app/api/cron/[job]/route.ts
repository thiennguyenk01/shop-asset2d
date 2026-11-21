import { isCronAuthorized, isCronJob } from "@backend/lib/cron/rules";
import { getEnv } from "@backend/env";
import { runCronJob } from "@backend/modules/maintenance/service";

/**
 * Scheduled jobs (GĐ6.3): GET /api/cron/reconcile · /api/cron/cleanup. Vercel Cron calls them with
 * `Authorization: Bearer <CRON_SECRET>` once deployed (schedule set up with the deployment, GĐ7); in development
 * run `npm run cron:run` instead. Anything without the secret gets the same 404 as an unknown path.
 */
export async function GET(request: Request, { params }: RouteContext<"/api/cron/[job]">) {
  const { job } = await params;
  if (!isCronJob(job) || !isCronAuthorized(request.headers.get("authorization"), getEnv().CRON_SECRET)) {
    return new Response("Not Found", { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  const startedAt = Date.now();
  const report = await runCronJob(job);
  console.info(`[cron] ${job}`, JSON.stringify(report), `${Date.now() - startedAt}ms`);
  return Response.json({ job, ...report }, { headers: { "Cache-Control": "no-store" } });
}

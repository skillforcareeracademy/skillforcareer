import { withRoute } from "@/lib/api/handler";
import { ok, fail } from "@/lib/api/response";
import { env } from "@/lib/env";
import { runDailyClassJobs } from "@/server/services/class-schedule-service";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The classes' morning sweep (07:30 IST): roll timetables forward and apply
 * holidays, email "your class is tomorrow — here is the link", and send the
 * day's festival wishes. Same Bearer CRON_SECRET contract as the other sweeps;
 * each step is idempotent, so a second run the same day sends nothing twice.
 */
async function run(req: Request) {
  if (env.CRON_SECRET) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${env.CRON_SECRET}`) {
      return fail("UNAUTHORIZED", "Invalid cron secret.", 401);
    }
  }
  const result = await runDailyClassJobs();
  logger.info("cron.classes", { ...result });
  return ok(result);
}

export const GET = withRoute(async (req) => run(req));
export const POST = withRoute(async (req) => run(req));

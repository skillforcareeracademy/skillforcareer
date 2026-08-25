import { withRoute } from "@/lib/api/handler";
import { ok, fail } from "@/lib/api/response";
import { env } from "@/lib/env";
import { runLeadReminders } from "@/server/services/lead-reminder-service";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Scheduled sweep for centre visits happening in the next 24 hours. Same Bearer
 * CRON_SECRET contract as the payment sweep, so it runs on any cron runner.
 */
async function run(req: Request) {
  if (env.CRON_SECRET) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${env.CRON_SECRET}`) {
      return fail("UNAUTHORIZED", "Invalid cron secret.", 401);
    }
  }
  const result = await runLeadReminders();
  logger.info("cron.lead_reminders", { ...result });
  return ok(result);
}

export const GET = withRoute(async (req) => run(req));
export const POST = withRoute(async (req) => run(req));

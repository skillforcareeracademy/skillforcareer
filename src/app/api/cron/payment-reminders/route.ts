import { withRoute } from "@/lib/api/handler";
import { ok, fail } from "@/lib/api/response";
import { env } from "@/lib/env";
import { runPaymentReminders } from "@/server/services/payment-reminder-service";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Scheduled sweep for overdue/upcoming dues. Wire it to a scheduler (Vercel Cron
 * points here on a schedule) — it authenticates with a Bearer CRON_SECRET so it
 * stays portable to any cron runner, not just Vercel. When CRON_SECRET is unset
 * (local dev), the guard is skipped so it can be exercised by hand.
 */
async function run(req: Request) {
  if (env.CRON_SECRET) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${env.CRON_SECRET}`) {
      return fail("UNAUTHORIZED", "Invalid cron secret.", 401);
    }
  }
  const result = await runPaymentReminders();
  logger.info("cron.payment_reminders", { ...result });
  return ok(result);
}

export const GET = withRoute(async (req) => run(req));
export const POST = withRoute(async (req) => run(req));

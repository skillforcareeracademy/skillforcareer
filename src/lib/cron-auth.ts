import { env } from "@/lib/env";

/**
 * Who may run a scheduled sweep.
 *
 * With `CRON_SECRET` set, only a caller presenting it may — the portable
 * contract, so these endpoints work under any cron runner. Without it, only
 * the platform's own scheduler gets in (Vercel Cron calls with a
 * platform scheduler sends `x-vercel-cron-schedule`) — on a deployment where the secret was never
 * set, an open URL would otherwise let anyone fire off a day's emails.
 * Locally, where there is no secret and no platform, it stays open so the
 * sweeps can be exercised by hand.
 */
export function cronCallerAllowed(req: Request): boolean {
  if (env.CRON_SECRET) {
    return req.headers.get("authorization") === `Bearer ${env.CRON_SECRET}`;
  }
  if (process.env.NODE_ENV !== "production") return true;
  // Vercel puts the schedule that fired on every cron request; nothing from
  // the outside carries it.
  return req.headers.has("x-vercel-cron-schedule");
}

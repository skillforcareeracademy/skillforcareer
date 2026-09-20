import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiUser } from "@/lib/auth/api-guard";
import { getHolidayToday } from "@/server/services/holiday-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/student/holiday-today — today's festival or holiday, for the banner
 * on the live-classes screen. Kept apart from /api/student/live so that route
 * keeps returning the plain array the installed mobile apps parse.
 */
export const GET = withRoute(async () => {
  await requireApiUser();
  return ok({ holiday: await getHolidayToday() });
});

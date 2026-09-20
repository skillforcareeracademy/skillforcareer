import { withRoute } from "@/lib/api/handler";
import { ok, created } from "@/lib/api/response";
import { AppError } from "@/lib/api/errors";
import { requireApiPermission, isStaffRole } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { holidaySchema } from "@/lib/validations/holiday";
import { createHoliday, listHolidays } from "@/server/services/holiday-service";
import { istToday } from "@/lib/ist";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Holidays affect every batch, so only admins change them; instructors (who
 * also hold batches:manage for their own batches) may read the list.
 */
async function requireHolidayAdmin() {
  const user = await requireApiPermission(PERMISSIONS.MANAGE_BATCHES);
  if (!isStaffRole(user.role)) throw AppError.forbidden("Only admins can change holidays.");
  return user;
}

/** GET /api/holidays?year=2026 */
export const GET = withRoute(async (req) => {
  await requireApiPermission(PERMISSIONS.MANAGE_BATCHES);
  const raw = Number(new URL(req.url).searchParams.get("year"));
  const year = Number.isInteger(raw) && raw >= 2000 && raw <= 2100 ? raw : Number(istToday().slice(0, 4));
  return ok({ year, holidays: await listHolidays(year) });
});

export const POST = withRoute(async (req) => {
  await requireHolidayAdmin();
  const input = holidaySchema.parse(await req.json().catch(() => ({})));
  const result = await createHoliday(input);
  return created({ ...result, message: "Holiday added." });
});

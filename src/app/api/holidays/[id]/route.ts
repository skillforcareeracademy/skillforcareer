import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { AppError } from "@/lib/api/errors";
import { requireApiPermission, isStaffRole } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { holidaySchema } from "@/lib/validations/holiday";
import { deleteHoliday, updateHoliday } from "@/server/services/holiday-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireHolidayAdmin() {
  const user = await requireApiPermission(PERMISSIONS.MANAGE_BATCHES);
  if (!isStaffRole(user.role)) throw AppError.forbidden("Only admins can change holidays.");
  return user;
}

export const PATCH = withRoute(async (req, { params }) => {
  const id = String((await params).id);
  await requireHolidayAdmin();
  const input = holidaySchema.parse(await req.json().catch(() => ({})));
  const result = await updateHoliday(id, input);
  return ok({ ...result, message: "Holiday saved." });
});

export const DELETE = withRoute(async (_req, { params }) => {
  const id = String((await params).id);
  await requireHolidayAdmin();
  const result = await deleteHoliday(id);
  return ok({ ...result, message: "Holiday deleted." });
});

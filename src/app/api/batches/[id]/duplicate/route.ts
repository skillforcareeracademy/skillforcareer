import { withRoute } from "@/lib/api/handler";
import { created } from "@/lib/api/response";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { duplicateBatch } from "@/server/services/batch-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Copy a cohort's timetable, team and content into a new intake. */
export const POST = withRoute(async (_req, { params }) => {
  await requireApiPermission(PERMISSIONS.MANAGE_BATCHES);
  const id = await duplicateBatch(String((await params).id));
  return created({ id, message: "Copied. Nobody is enrolled in the copy yet." });
});

import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { exportCurriculums } from "@/server/services/curriculum-plan-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The curriculums as a spreadsheet — one row per section. */
export async function GET() {
  await requireApiPermission(PERMISSIONS.MANAGE_CURRICULUM);
  const csv = await exportCurriculums();
  const day = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="curriculum-${day}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

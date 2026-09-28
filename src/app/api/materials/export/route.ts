import { withRoute } from "@/lib/api/handler";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS, ROLES } from "@/config/roles";
import { csvResponse } from "@/lib/csv";
import { exportMaterials } from "@/server/services/study-material-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The whole library as a spreadsheet, reading figures included. */
export const GET = withRoute(async () => {
  const user = await requireApiPermission(PERMISSIONS.MANAGE_MATERIAL);
  const staff = user.roles.some((r) => r === ROLES.SUPER_ADMIN || r === ROLES.ADMIN);
  const csv = await exportMaterials(staff ? undefined : user.id);
  return csvResponse("study-material.csv", csv);
});

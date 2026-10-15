import { withRoute } from "@/lib/api/handler";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { streamZip } from "@/server/services/export-zip";
import { backupEntries } from "@/server/services/backup-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A whole-platform backup gathers every table and every file.
export const maxDuration = 300;

/**
 * Download everything on the LMS as one ZIP — super-admin only, since it is the
 * whole platform's data and files, every company's included.
 */
export const GET = withRoute(async () => {
  // settings:manage is held by the super admin alone.
  await requireApiPermission(PERMISSIONS.MANAGE_SETTINGS);
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  return streamZip(`lms-backup-${stamp}.zip`, async (add) => {
    for await (const entry of backupEntries()) {
      await add(entry);
    }
  });
});

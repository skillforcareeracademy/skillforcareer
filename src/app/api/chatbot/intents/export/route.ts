import { withRoute } from "@/lib/api/handler";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { toCsv, csvResponse } from "@/lib/csv";
import { intentsForExport } from "@/server/services/chatbot-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Ami's whole knowledge base as a spreadsheet — the same columns the importer
 * reads, so an academy can export, edit in Excel and import back.
 */
export const GET = withRoute(async () => {
  await requireApiPermission(PERMISSIONS.MANAGE_HOMEPAGE);
  const { headers, data } = await intentsForExport();
  const stamp = new Date().toISOString().slice(0, 10);
  return csvResponse(`ami-answers-${stamp}.csv`, toCsv(headers, data));
});

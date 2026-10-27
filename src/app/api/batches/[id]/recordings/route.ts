import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiStaff } from "@/lib/auth/api-guard";
import { listRecordingsForBatch } from "@/server/services/recording-request-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/batches/:id/recordings — this batch's class recordings. */
export const GET = withRoute(async (_req, { params }) => {
  await requireApiStaff();
  const { id } = (await params) as { id: string };
  return ok(await listRecordingsForBatch(String(id)));
});

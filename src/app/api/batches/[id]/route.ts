import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireBatchWrite } from "@/lib/auth/api-guard";
import { updateBatchSchema } from "@/lib/validations/batch";
import { updateBatch, deleteBatch, getBatchDetail } from "@/server/services/batch-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withRoute(async (_req, { params }) => {
  const id = String((await params).id);
  await requireBatchWrite(id);
  return ok(await getBatchDetail(id));
});

export const PATCH = withRoute(async (req, { params }) => {
  const id = String((await params).id);
  await requireBatchWrite(id);
  const input = updateBatchSchema.parse(await req.json().catch(() => ({})));
  await updateBatch(id, input);
  return ok({ message: "Batch saved." });
});

export const DELETE = withRoute(async (_req, { params }) => {
  const id = String((await params).id);
  await requireBatchWrite(id);
  await deleteBatch(id);
  return ok({ message: "Batch deleted." });
});

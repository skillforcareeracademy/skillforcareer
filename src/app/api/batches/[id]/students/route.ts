import { withRoute } from "@/lib/api/handler";
import { ok, created } from "@/lib/api/response";
import { requireBatchWrite } from "@/lib/auth/api-guard";
import { batchStudentsSchema } from "@/lib/validations/batch";
import {
  listBatchStudents,
  listStudentsForBatchSelect,
  addBatchStudents,
} from "@/server/services/batch-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The batch roster — or, with `?candidates`, the students available to add to it
 * (for the picker). Both are gated on being able to manage this batch.
 */
export const GET = withRoute(async (req, { params }) => {
  const id = String((await params).id);
  await requireBatchWrite(id);
  const url = new URL(req.url);
  if (url.searchParams.has("candidates")) {
    const search = url.searchParams.get("search") ?? undefined;
    return ok({ candidates: await listStudentsForBatchSelect(search || undefined) });
  }
  return ok({ students: await listBatchStudents(id) });
});

export const POST = withRoute(async (req, { params }) => {
  const id = String((await params).id);
  await requireBatchWrite(id);
  const { userIds } = batchStudentsSchema.parse(await req.json().catch(() => ({})));
  const count = await addBatchStudents(id, userIds);
  return created({
    count,
    message:
      count === 0
        ? "Already on this batch."
        : `${count} student${count === 1 ? "" : "s"} added.`,
  });
});

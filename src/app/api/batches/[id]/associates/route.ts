import { withRoute } from "@/lib/api/handler";
import { ok, created } from "@/lib/api/response";
import { requireBatchAccess, requireBatchWrite } from "@/lib/auth/api-guard";
import { batchAssociatesSchema } from "@/lib/validations/batch-profile";
import {
  listBatchAssociates,
  listAssociateCandidates,
  addBatchAssociates,
} from "@/server/services/batch-associate-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The batch's associate instructors — or, with `?candidates`, the instructors
 * who could be added (for the picker). Anyone teaching the batch may see who
 * else does; only staff and the lead may change it.
 */
export const GET = withRoute(async (req, { params }) => {
  const id = String((await params).id);
  const url = new URL(req.url);
  if (url.searchParams.has("candidates")) {
    await requireBatchWrite(id);
    const search = url.searchParams.get("search") || undefined;
    return ok({ candidates: await listAssociateCandidates(id, search) });
  }
  await requireBatchAccess(id);
  return ok({ associates: await listBatchAssociates(id) });
});

export const POST = withRoute(async (req, { params }) => {
  const id = String((await params).id);
  await requireBatchWrite(id);
  const { userIds } = batchAssociatesSchema.parse(
    await req.json().catch(() => ({})),
  );
  const count = await addBatchAssociates(id, userIds);
  return created({
    count,
    message:
      count === 0
        ? "Already teaching this batch."
        : `${count} associate instructor${count === 1 ? "" : "s"} added.`,
  });
});

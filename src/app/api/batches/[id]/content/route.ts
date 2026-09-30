import { z } from "zod";
import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireBatchWrite } from "@/lib/auth/api-guard";
import {
  batchContent,
  setBatchContent,
  type ContentKind,
} from "@/server/services/batch-content-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  kind: z.enum(["QUIZ", "MATERIAL", "ASSIGNMENT", "CURRICULUM"]),
  groupIds: z.array(z.string().min(1)).max(200).default([]),
  itemIds: z.array(z.string().min(1)).max(2000).default([]),
});

/** GET — what this cohort has been set, and everything it could be set. */
export const GET = withRoute(async (_req, { params }) => {
  const id = String((await params).id);
  await requireBatchWrite(id);
  return ok({ sections: await batchContent(id) });
});

/**
 * PATCH — set one library for this cohort. Folders and named items are
 * independent: giving a folder does not name its contents, which is the point.
 */
export const PATCH = withRoute(async (req, { params }) => {
  const id = String((await params).id);
  await requireBatchWrite(id);
  const input = schema.parse(await req.json().catch(() => ({})));
  await setBatchContent(id, input.kind as ContentKind, {
    groupIds: input.groupIds,
    itemIds: input.itemIds,
  });
  return ok({ message: "Saved for this batch." });
});

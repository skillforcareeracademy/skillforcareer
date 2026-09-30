import { z } from "zod";
import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiLeadAdmin } from "@/lib/auth/api-guard";
import { deleteStatus, updateStatus } from "@/server/services/lead-pipeline-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  isActive: z.boolean().optional(),
});

export const PATCH = withRoute(async (req, { params }) => {
  await requireApiLeadAdmin();
  const id = String((await params).id);
  await updateStatus(id, schema.parse(await req.json().catch(() => ({}))));
  return ok({ message: "Saved." });
});

/** A lead's own sub-status is free text, so nothing recorded changes. */
export const DELETE = withRoute(async (_req, { params }) => {
  await requireApiLeadAdmin();
  await deleteStatus(String((await params).id));
  return ok({ message: "Status removed." });
});

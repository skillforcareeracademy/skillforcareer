import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireBatchAccess } from "@/lib/auth/api-guard";
import { batchNoteSchema } from "@/lib/validations/batch-profile";
import {
  updateBatchNote,
  deleteBatchNote,
} from "@/server/services/batch-note-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PATCH = withRoute(async (req, { params }) => {
  const p = await params;
  const id = String(p.id);
  await requireBatchAccess(id);
  const input = batchNoteSchema.parse(await req.json().catch(() => ({})));
  await updateBatchNote(id, String(p.noteId), input);
  return ok({ message: "Note saved." });
});

export const DELETE = withRoute(async (_req, { params }) => {
  const p = await params;
  const id = String(p.id);
  await requireBatchAccess(id);
  await deleteBatchNote(id, String(p.noteId));
  return ok({ message: "Note deleted." });
});

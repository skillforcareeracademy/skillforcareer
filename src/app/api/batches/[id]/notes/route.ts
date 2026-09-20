import { withRoute } from "@/lib/api/handler";
import { ok, created } from "@/lib/api/response";
import { requireBatchAccess } from "@/lib/auth/api-guard";
import { batchNoteSchema } from "@/lib/validations/batch-profile";
import {
  listBatchNotes,
  createBatchNote,
} from "@/server/services/batch-note-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withRoute(async (_req, { params }) => {
  const id = String((await params).id);
  await requireBatchAccess(id);
  return ok({ notes: await listBatchNotes(id) });
});

export const POST = withRoute(async (req, { params }) => {
  const id = String((await params).id);
  const user = await requireBatchAccess(id);
  const input = batchNoteSchema.parse(await req.json().catch(() => ({})));
  const noteId = await createBatchNote(id, input, user.id);
  return created({ id: noteId, message: "Note shared with the batch." });
});

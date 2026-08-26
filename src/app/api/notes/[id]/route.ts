import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiUser } from "@/lib/auth/api-guard";
import { updateNoteSchema } from "@/lib/validations/learning";
import { deleteNote, updateNote } from "@/server/services/learning-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Reword a note in place — the notes page edits them long after writing. */
export const PATCH = withRoute(async (req, { params }) => {
  const user = await requireApiUser();
  const id = String((await params).id);
  const { content } = updateNoteSchema.parse(await req.json().catch(() => ({})));
  await updateNote(user.id, id, content);
  return ok({ message: "Note updated." });
});

export const DELETE = withRoute(async (_req, { params }) => {
  const user = await requireApiUser();
  const id = String((await params).id);
  await deleteNote(user.id, id);
  return ok({ message: "Note deleted." });
});

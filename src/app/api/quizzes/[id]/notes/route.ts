import { withRoute } from "@/lib/api/handler";
import { ok, created } from "@/lib/api/response";
import { requireApiUser } from "@/lib/auth/api-guard";
import { noteSchema } from "@/lib/validations/learning";
import { listNotes, addNote } from "@/server/services/learning-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A learner's own notes on a quiz — revision jottings, not marking. */
export const GET = withRoute(async (_req, { params }) => {
  const user = await requireApiUser();
  const id = String((await params).id);
  return ok(await listNotes(user.id, { kind: "quiz", id }));
});

export const POST = withRoute(async (req, { params }) => {
  const user = await requireApiUser();
  const id = String((await params).id);
  const input = noteSchema.parse(await req.json().catch(() => ({})));
  const noteId = await addNote(user.id, { kind: "quiz", id }, input);
  return created({ id: noteId, message: "Note saved." });
});

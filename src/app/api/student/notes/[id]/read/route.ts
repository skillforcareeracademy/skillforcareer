import { z } from "zod";
import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiUser } from "@/lib/auth/api-guard";
import { recordNoteRead } from "@/server/services/note-read-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  /** Seconds since the last heartbeat. Clamped by the service. */
  seconds: z.number().min(0).max(600).optional(),
  /** True on the heartbeat that opens the note, so opens can be counted. */
  opened: z.boolean().optional(),
});

/**
 * POST /api/student/notes/<id>/read — a heartbeat from the note reader.
 *
 * Deliberately quiet: it answers `{ ok: true }` whether or not the row moved,
 * because the reader fires it in the background (including on the way out of
 * the page) and has nothing useful to do with a failure.
 */
export const POST = withRoute(async (req, { params }) => {
  const user = await requireApiUser();
  const id = String((await params).id);
  const raw = await req.json().catch(() => ({}));
  const body = bodySchema.parse(raw ?? {});
  await recordNoteRead(user.id, id, body.seconds ?? 0, body.opened ?? false);
  return ok({ ok: true });
});

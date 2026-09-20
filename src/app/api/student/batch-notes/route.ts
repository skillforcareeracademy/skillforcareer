import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiUser } from "@/lib/auth/api-guard";
import { listStudentBatchNotes } from "@/server/services/batch-note-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/student/batch-notes — notes shared with the batches the learner
 * sits in, newest first. Read by the learner panel and the mobile apps:
 * `{ notes: [{ id, title, body, fileUrl, fileName, batchName, courseTitle, createdAt }] }`.
 */
export const GET = withRoute(async () => {
  const user = await requireApiUser();
  return ok({ notes: await listStudentBatchNotes(user.id) });
});

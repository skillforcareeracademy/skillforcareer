import { withRoute } from "@/lib/api/handler";
import { ok, created } from "@/lib/api/response";
import { requireMeetingWrite } from "@/lib/auth/api-guard";
import { meetingStudentsSchema } from "@/lib/validations/live";
import {
  listMeetingStudents,
  addMeetingStudents,
} from "@/server/services/live-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Learners individually added to a class (offline workshops, hybrid sessions). */
export const GET = withRoute(async (_req, { params }) => {
  const id = String((await params).id);
  await requireMeetingWrite(id);
  return ok({ students: await listMeetingStudents(id) });
});

export const POST = withRoute(async (req, { params }) => {
  const id = String((await params).id);
  await requireMeetingWrite(id);
  const { userIds } = meetingStudentsSchema.parse(
    await req.json().catch(() => ({})),
  );
  const count = await addMeetingStudents(id, userIds);
  return created({
    count,
    message:
      count === 0
        ? "Already on this class."
        : `${count} student${count === 1 ? "" : "s"} added.`,
  });
});

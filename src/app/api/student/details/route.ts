import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiUser } from "@/lib/auth/api-guard";
import { studentDetailSchema } from "@/lib/validations/student-detail";
import {
  getStudentDetail,
  saveStudentDetail,
} from "@/server/services/student-detail-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — the learner's own onboarding form, with what's left to fill in. */
export const GET = withRoute(async () => {
  const user = await requireApiUser();
  return ok(await getStudentDetail(user.id));
});

/**
 * PATCH — save it. `submit: true` finishes the form, after which the documents
 * and schooling are read-only to them and only the office can change those.
 */
export const PATCH = withRoute(async (req) => {
  const user = await requireApiUser();
  const input = studentDetailSchema.parse(await req.json());
  const view = await saveStudentDetail(user.id, input);
  return ok({
    ...view,
    message: input.submit
      ? "Your details are in — thank you."
      : "Saved. You can come back and finish any time.",
  });
});

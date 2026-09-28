import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiStaff } from "@/lib/auth/api-guard";
import { studentDetailSchema } from "@/lib/validations/student-detail";
import {
  getStudentDetail,
  saveStudentDetailByStaff,
} from "@/server/services/student-detail-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — a learner's onboarding form, as the office sees it. */
export const GET = withRoute(async (_req, { params }) => {
  await requireApiStaff();
  const id = String((await params).id);
  return ok(await getStudentDetail(id));
});

/**
 * PATCH — the office's correction. Nothing is locked here: a learner can't change
 * their own Aadhaar once it's in, but admissions can.
 */
export const PATCH = withRoute(async (req, { params }) => {
  await requireApiStaff();
  const id = String((await params).id);
  const input = studentDetailSchema.parse(await req.json());
  const view = await saveStudentDetailByStaff(id, input);
  return ok({ ...view, message: "Details updated." });
});

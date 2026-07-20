import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireSubmissionGrade } from "@/lib/auth/api-guard";
import { gradeSubmissionSchema } from "@/lib/validations/assignment";
import { gradeSubmission } from "@/server/services/assignment-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withRoute(async (req, { params }) => {
  const id = String((await params).id);
  const user = await requireSubmissionGrade(id);
  const input = gradeSubmissionSchema.parse(await req.json().catch(() => ({})));
  await gradeSubmission(id, input, user.id);
  return ok({ message: "Submission graded." });
});

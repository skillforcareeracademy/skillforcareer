import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiUser } from "@/lib/auth/api-guard";
import { AppError } from "@/lib/api/errors";
import { ROLES } from "@/config/roles";
import { submitQuizSchema } from "@/lib/validations/quiz-attempt";
import { submitQuizAttempt } from "@/server/services/student-quiz-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withRoute(async (req, { params }) => {
  const user = await requireApiUser();
  const id = String((await params).id);
  const input = submitQuizSchema.parse(await req.json().catch(() => ({})));
  const preview = new URL(req.url).searchParams.get("preview") === "1";
  if (preview) {
    const staff = user.roles.some(
      (r) =>
        r === ROLES.SUPER_ADMIN || r === ROLES.ADMIN || r === ROLES.INSTRUCTOR,
    );
    if (!staff) throw AppError.forbidden("Only staff may preview a quiz.");
  }
  const result = await submitQuizAttempt(user.id, id, input, preview);
  return ok(result);
});

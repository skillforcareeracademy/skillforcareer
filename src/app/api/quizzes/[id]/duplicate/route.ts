import { withRoute } from "@/lib/api/handler";
import { created } from "@/lib/api/response";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { duplicateQuiz } from "@/server/services/quiz-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Copy a quiz and its questions into a fresh draft. */
export const POST = withRoute(async (_req, { params }) => {
  const user = await requireApiPermission(PERMISSIONS.MANAGE_QUIZ);
  const id = await duplicateQuiz(String((await params).id), user.id);
  return created({ id, message: "Copied. The copy is a draft." });
});

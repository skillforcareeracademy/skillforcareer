import { withRoute } from "@/lib/api/handler";
import { created, ok } from "@/lib/api/response";
import { requireQuizWrite } from "@/lib/auth/api-guard";
import { ROLES } from "@/config/roles";
import { quizSourceSchema } from "@/lib/validations/quiz";
import { linkQuizSource, listNoteSources } from "@/server/services/quiz-source-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The notes that could be named as this quiz's source. */
export const GET = withRoute(async (_req, { params }) => {
  const id = String((await params).id);
  const user = await requireQuizWrite(id);
  const staff = user.roles.some((r) => r === ROLES.SUPER_ADMIN || r === ROLES.ADMIN);
  return ok({ sources: await listNoteSources(staff ? undefined : user.id) });
});

/** Record the notes this quiz was prepared from. */
export const POST = withRoute(async (req, { params }) => {
  const id = String((await params).id);
  await requireQuizWrite(id);
  const input = quizSourceSchema.parse(await req.json().catch(() => ({})));
  const sourceId = await linkQuizSource(id, input);
  return created({ id: sourceId, message: "Notes linked to this quiz." });
});

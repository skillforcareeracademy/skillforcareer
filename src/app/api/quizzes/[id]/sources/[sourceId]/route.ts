import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireQuizWrite } from "@/lib/auth/api-guard";
import { unlinkQuizSource } from "@/server/services/quiz-source-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const DELETE = withRoute(async (_req, { params }) => {
  const p = await params;
  const id = String(p.id);
  await requireQuizWrite(id);
  await unlinkQuizSource(id, String(p.sourceId));
  return ok({ message: "Notes unlinked." });
});

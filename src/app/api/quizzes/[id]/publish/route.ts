import { z } from "zod";
import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireQuizWrite } from "@/lib/auth/api-guard";
import { publishQuiz } from "@/server/services/quiz-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ publish: z.boolean() });

export const POST = withRoute(async (req, { params }) => {
  const id = String((await params).id);
  await requireQuizWrite(id);
  const { publish } = bodySchema.parse(await req.json().catch(() => ({})));
  await publishQuiz(id, publish);
  return ok({ message: publish ? "Quiz published." : "Quiz unpublished." });
});

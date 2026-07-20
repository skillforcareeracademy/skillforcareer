import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiUser } from "@/lib/auth/api-guard";
import { progressSchema } from "@/lib/validations/learning";
import { updateLessonProgress } from "@/server/services/learning-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withRoute(async (req, { params }) => {
  const user = await requireApiUser();
  const id = String((await params).id);
  const input = progressSchema.parse(await req.json().catch(() => ({})));
  const result = await updateLessonProgress(user.id, id, input);
  return ok(result ?? { ok: true });
});

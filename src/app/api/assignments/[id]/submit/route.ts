import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiUser } from "@/lib/auth/api-guard";
import { submitAssignmentSchema } from "@/lib/validations/submission";
import { submitAssignment } from "@/server/services/student-assignment-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withRoute(async (req, { params }) => {
  const user = await requireApiUser();
  const id = String((await params).id);
  const input = submitAssignmentSchema.parse(await req.json().catch(() => ({})));
  await submitAssignment(user.id, id, input);
  return ok({ message: "Submitted." });
});

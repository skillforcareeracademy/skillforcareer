import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireAssignmentWrite } from "@/lib/auth/api-guard";
import { updateAssignmentSchema } from "@/lib/validations/assignment";
import {
  getAssignmentDetail,
  updateAssignment,
  deleteAssignment,
} from "@/server/services/assignment-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withRoute(async (_req, { params }) => {
  const id = String((await params).id);
  await requireAssignmentWrite(id);
  return ok(await getAssignmentDetail(id));
});

export const PATCH = withRoute(async (req, { params }) => {
  const id = String((await params).id);
  await requireAssignmentWrite(id);
  const input = updateAssignmentSchema.parse(await req.json().catch(() => ({})));
  await updateAssignment(id, input);
  return ok({ message: "Assignment saved." });
});

export const DELETE = withRoute(async (_req, { params }) => {
  const id = String((await params).id);
  await requireAssignmentWrite(id);
  await deleteAssignment(id);
  return ok({ message: "Assignment deleted." });
});

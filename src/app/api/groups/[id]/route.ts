import { prisma } from "@/lib/prisma";
import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { AppError } from "@/lib/api/errors";
import { requireGroupWrite } from "@/lib/auth/group-guard";
import { updateGroupSchema } from "@/lib/validations/group";
import { deleteGroup, updateGroup } from "@/server/services/content-group-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function kindOf(id: string) {
  const row = await prisma.contentGroup.findUnique({ where: { id }, select: { kind: true } });
  if (!row) throw AppError.notFound("Group not found.");
  return row.kind;
}

export const PATCH = withRoute(async (req, { params }) => {
  const id = String((await params).id);
  await requireGroupWrite(await kindOf(id));
  const input = updateGroupSchema.parse(await req.json().catch(() => ({})));
  await updateGroup(id, input);
  return ok({ message: "Saved." });
});

/** Its sub-groups go with it; what was filed inside is left un-filed. */
export const DELETE = withRoute(async (_req, { params }) => {
  const id = String((await params).id);
  await requireGroupWrite(await kindOf(id));
  const removed = await deleteGroup(id);
  return ok({
    removed,
    message:
      removed > 1
        ? `Group and ${removed - 1} sub-group${removed === 2 ? "" : "s"} removed. Nothing inside was deleted.`
        : "Group removed. Nothing inside was deleted.",
  });
});

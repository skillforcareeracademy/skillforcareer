import { prisma } from "@/lib/prisma";
import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { AppError } from "@/lib/api/errors";
import { requireGroupWrite } from "@/lib/auth/group-guard";
import { reorderGroupsSchema } from "@/lib/validations/group";
import { reorderGroups } from "@/server/services/content-group-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Put a set of siblings in the order given. */
export const PATCH = withRoute(async (req) => {
  const { ids } = reorderGroupsSchema.parse(await req.json().catch(() => ({})));
  const first = await prisma.contentGroup.findUnique({
    where: { id: ids[0] },
    select: { kind: true },
  });
  if (!first) throw AppError.notFound("Group not found.");
  await requireGroupWrite(first.kind);
  const count = await reorderGroups(ids);
  return ok({ count, message: "Order saved." });
});

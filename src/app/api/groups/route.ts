import { withRoute } from "@/lib/api/handler";
import { created, ok } from "@/lib/api/response";
import { AppError } from "@/lib/api/errors";
import { requireGroupWrite } from "@/lib/auth/group-guard";
import { createGroupSchema, groupKindSchema } from "@/lib/validations/group";
import { groupOptions, groupTree } from "@/server/services/content-group-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/groups?kind=QUIZ — one library's folders.
 * `flat=1` returns them as a list with full paths, which is what a picker wants.
 */
export const GET = withRoute(async (req) => {
  const url = new URL(req.url);
  const parsed = groupKindSchema.safeParse(url.searchParams.get("kind"));
  if (!parsed.success) throw AppError.badRequest("Which library?");
  await requireGroupWrite(parsed.data);
  return url.searchParams.get("flat")
    ? ok({ groups: await groupOptions(parsed.data) })
    : ok({ groups: await groupTree(parsed.data) });
});

export const POST = withRoute(async (req) => {
  const input = createGroupSchema.parse(await req.json().catch(() => ({})));
  await requireGroupWrite(input.kind);
  const { createGroup } = await import("@/server/services/content-group-service");
  const id = await createGroup({
    kind: input.kind,
    name: input.name,
    parentId: input.parentId || null,
    description: input.description || null,
  });
  return created({ id, message: input.parentId ? "Sub-group added." : "Group added." });
});

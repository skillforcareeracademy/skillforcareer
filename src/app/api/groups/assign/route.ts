import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireGroupWrite } from "@/lib/auth/group-guard";
import { groupKindSchema, setGroupsSchema } from "@/lib/validations/group";
import { AppError } from "@/lib/api/errors";
import { groupsOf, setGroupsFor } from "@/server/services/content-group-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — which folders one item is already filed in. */
export const GET = withRoute(async (req) => {
  const url = new URL(req.url);
  const kind = groupKindSchema.safeParse(url.searchParams.get("kind"));
  const itemId = url.searchParams.get("itemId");
  if (!kind.success || !itemId) throw AppError.badRequest("Which item, in which library?");
  await requireGroupWrite(kind.data);
  return ok({ groupIds: await groupsOf(kind.data, itemId) });
});

/**
 * PATCH /api/groups/assign — file one item in a set of folders.
 *
 * Kept apart from each module's own save so a quiz, a curriculum and an
 * assignment can all gain folders without any of them learning what a folder
 * is. The picker sends the whole set; it replaces what was there.
 */
export const PATCH = withRoute(async (req) => {
  const input = setGroupsSchema.parse(await req.json().catch(() => ({})));
  await requireGroupWrite(input.kind);
  await setGroupsFor(input.kind, input.itemId, input.groupIds);
  return ok({ groupIds: await groupsOf(input.kind, input.itemId), message: "Groups saved." });
});

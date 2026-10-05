import { withRoute } from "@/lib/api/handler";
import { created, ok } from "@/lib/api/response";
import { requireApiUser, requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import {
  asLinkable,
  linkContent,
  linkableOptions,
  linkedTo,
} from "@/server/services/content-link-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * What is joined to one piece (`?kind=&id=`), or what could be joined to it
 * (`?options=&search=`). Open to anyone signed in: a learner is shown the same
 * related reading on the quiz they are sitting.
 */
export const GET = withRoute(async (req) => {
  await requireApiUser();
  const sp = new URL(req.url).searchParams;

  const optionsFor = sp.get("options");
  if (optionsFor) {
    return ok({
      options: await linkableOptions(asLinkable(optionsFor), sp.get("search") ?? ""),
    });
  }

  const kind = asLinkable(sp.get("kind"));
  const id = sp.get("id") ?? "";
  return ok({ linked: await linkedTo(kind, id) });
});

/** Join two pieces. */
export const POST = withRoute(async (req) => {
  const user = await requireApiPermission(PERMISSIONS.MANAGE_MATERIAL);
  const body = (await req.json().catch(() => ({}))) as Record<string, string>;
  const id = await linkContent(
    asLinkable(body.fromKind ?? null),
    String(body.fromId ?? ""),
    asLinkable(body.toKind ?? null),
    String(body.toId ?? ""),
    user.id,
  );
  return created({ id, message: "Linked." });
});

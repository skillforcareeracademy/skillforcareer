import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiLeadList } from "@/lib/auth/api-guard";
import { leadViewFrom } from "@/lib/validations/lead";
import { leadIdsPage } from "@/server/services/lead-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One page of lead ids under the list's filters and sort — the detail sheet
 * asks for the neighbouring page when next / previous crosses a boundary.
 */
export const GET = withRoute(async (req) => {
  const guard = await requireApiLeadList();
  const sp = new URL(req.url).searchParams;
  const page = Math.max(1, Math.trunc(Number(sp.get("page"))) || 1);
  const pageSize = Math.min(
    100,
    Math.max(1, Math.trunc(Number(sp.get("pageSize"))) || 12),
  );
  return ok(
    await leadIdsPage({
      ...leadViewFrom((key) => sp.get(key)),
      viewerId: guard.user.id,
      ownOnly: !guard.all,
      page,
      pageSize,
    }),
  );
});

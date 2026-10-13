import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import {
  addPeopleToCompany,
  listAssignableUsers,
  listCompanyPeople,
} from "@/server/services/company-service";
import { requireAcademyOwner } from "@/lib/auth/api-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The company's people, and — with `?available=1` — the academy's own accounts
 * that could be moved into it.
 */
export const GET = withRoute(async (req, { params }) => {
  await requireAcademyOwner();
  const id = String((await params).id);
  const url = new URL(req.url);
  if (url.searchParams.get("available")) {
    return ok({
      people: await listAssignableUsers(url.searchParams.get("q") ?? ""),
    });
  }
  return ok({ people: await listCompanyPeople(id) });
});

export const POST = withRoute(async (req, { params }) => {
  await requireAcademyOwner();
  const id = String((await params).id);
  const body = (await req.json().catch(() => ({}))) as { userIds?: unknown };
  const userIds = Array.isArray(body.userIds)
    ? body.userIds.filter((v): v is string => typeof v === "string")
    : [];
  const result = await addPeopleToCompany(id, userIds);
  return ok({
    ...result,
    message:
      result.added === 0
        ? "Nobody was added."
        : `${result.added} ${result.added === 1 ? "person" : "people"} moved in.`,
  });
});

import { withRoute } from "@/lib/api/handler";
import { ok, created } from "@/lib/api/response";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { webinarParticipantsSchema } from "@/lib/validations/webinar";
import {
  listWebinarParticipants,
  addWebinarParticipants,
  listStudentsForWebinarSelect,
} from "@/server/services/webinar-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The webinar's participant list — or, with `?candidates`, the learners
 * available to add to it.
 */
export const GET = withRoute(async (req, { params }) => {
  await requireApiPermission(PERMISSIONS.HOST_LIVE_CLASS);
  const id = String((await params).id);
  const url = new URL(req.url);
  if (url.searchParams.has("candidates")) {
    const search = url.searchParams.get("search") ?? undefined;
    return ok({ candidates: await listStudentsForWebinarSelect(search || undefined) });
  }
  return ok({ participants: await listWebinarParticipants(id) });
});

export const POST = withRoute(async (req, { params }) => {
  await requireApiPermission(PERMISSIONS.HOST_LIVE_CLASS);
  const id = String((await params).id);
  const input = webinarParticipantsSchema.parse(await req.json().catch(() => ({})));
  const count = await addWebinarParticipants(id, input);
  return created({
    count,
    message:
      count === 0
        ? "Already on this webinar."
        : `${count} participant${count === 1 ? "" : "s"} added.`,
  });
});

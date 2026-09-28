import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiUser } from "@/lib/auth/api-guard";
import { consumeMaterialDownload } from "@/server/services/material-learner-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST — ask for the file. Answers with the link when the academy allows
 * downloads for this material, and counts the copy taken; refuses when the
 * switch is off, so the file's address is never in the page for material that
 * is meant to be read in the panel.
 */
export const POST = withRoute(async (_req, { params }) => {
  const user = await requireApiUser();
  const id = String((await params).id);
  const file = await consumeMaterialDownload(user.id, id);
  return ok(file);
});

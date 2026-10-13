import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiUser } from "@/lib/auth/api-guard";
import { consumeAssetDownload } from "@/server/services/material-learner-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Ask for one of the attachments beneath a reading. */
export const POST = withRoute(async (_req, { params }) => {
  const user = await requireApiUser();
  const { id, assetId } = await params;
  return ok(await consumeAssetDownload(user.id, String(id), String(assetId)));
});

import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireMeetingWrite } from "@/lib/auth/api-guard";
import { mediaConfigured, vpsSignedUrl } from "@/lib/recording-media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/meetings/:id/recording/upload-ticket — where to put the recording.
 *
 * When VPS storage is configured, the host's browser gets a short-lived signed
 * URL to upload the file straight to the media service (bypassing the 4.5 MB
 * limit); otherwise it's told to fall back to the small in-app upload.
 */
export const POST = withRoute(async (_req, { params }) => {
  const id = String((await params).id);
  await requireMeetingWrite(id);
  if (mediaConfigured()) {
    return ok({ mode: "vps", putUrl: vpsSignedUrl(id, "put", 1800) });
  }
  return ok({ mode: "direct" });
});

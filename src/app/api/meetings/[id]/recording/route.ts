import { withRoute } from "@/lib/api/handler";
import { created } from "@/lib/api/response";
import { AppError } from "@/lib/api/errors";
import { requireMeetingWrite } from "@/lib/auth/api-guard";
import { saveUpload, extForVideoMime, ACCEPTED_VIDEO_MIME } from "@/lib/storage";
import { setRecordingUrl } from "@/server/services/live-service";
import { mediaConfigured, vpsStoredUrl } from "@/lib/recording-media";
import { UPLOAD } from "@/lib/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/meetings/:id/recording — record where a session recording lives.
 *
 * VPS path (JSON `{ vps: true }`): the browser has already uploaded the file
 * straight to the media service, so this only stores its URL. Direct path
 * (multipart file): a small recording goes into the app's own storage.
 */
export const POST = withRoute(async (req, { params }) => {
  const id = String((await params).id);
  await requireMeetingWrite(id);

  if ((req.headers.get("content-type") ?? "").includes("application/json")) {
    const body = (await req.json().catch(() => ({}))) as { vps?: boolean };
    if (body?.vps && mediaConfigured()) {
      const url = vpsStoredUrl(id);
      await setRecordingUrl(id, url);
      return created({ url });
    }
    throw AppError.badRequest("No recording was provided.");
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw AppError.badRequest("No recording was provided.");

  const ext = extForVideoMime(file.type);
  const baseMime = file.type.split(";")[0].trim();
  if (!ext || !ACCEPTED_VIDEO_MIME.includes(baseMime)) {
    throw AppError.badRequest("Only WebM or MP4 recordings are allowed.");
  }
  if (file.size > UPLOAD.MAX_VIDEO_BYTES) {
    throw AppError.badRequest("Recording is too large.");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const url = await saveUpload(buffer, ext, file.name);
  await setRecordingUrl(id, url);
  return created({ url });
});

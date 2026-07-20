import { withRoute } from "@/lib/api/handler";
import { created } from "@/lib/api/response";
import { AppError } from "@/lib/api/errors";
import { requireMeetingWrite } from "@/lib/auth/api-guard";
import { saveUpload, extForVideoMime, ACCEPTED_VIDEO_MIME } from "@/lib/storage";
import { setRecordingUrl } from "@/server/services/live-service";
import { UPLOAD } from "@/lib/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/meetings/:id/recording — upload a session recording (webm/mp4). */
export const POST = withRoute(async (req, { params }) => {
  const id = String((await params).id);
  await requireMeetingWrite(id);

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
  const url = await saveUpload(buffer, ext);
  await setRecordingUrl(id, url);
  return created({ url });
});

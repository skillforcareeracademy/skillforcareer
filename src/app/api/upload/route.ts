import { withRoute } from "@/lib/api/handler";
import { created } from "@/lib/api/response";
import { AppError } from "@/lib/api/errors";
import { requireApiUser } from "@/lib/auth/api-guard";
import { saveUpload, extForMime, ACCEPTED_IMAGE_MIME } from "@/lib/storage";
import { UPLOAD } from "@/lib/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/upload — multipart image upload. Returns { url }. */
export const POST = withRoute(async (req) => {
  await requireApiUser();

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    throw AppError.badRequest("No file was provided.");
  }
  const ext = extForMime(file.type);
  if (!ext || !ACCEPTED_IMAGE_MIME.includes(file.type)) {
    throw AppError.badRequest("Only JPG, PNG, WebP, AVIF or GIF images are allowed.");
  }
  if (file.size > UPLOAD.MAX_IMAGE_BYTES) {
    throw AppError.badRequest("Image must be under 5 MB.");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const url = await saveUpload(buffer, ext);
  return created({ url });
});

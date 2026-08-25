import { withRoute } from "@/lib/api/handler";
import { created } from "@/lib/api/response";
import { AppError } from "@/lib/api/errors";
import { requireApiUser } from "@/lib/auth/api-guard";
import {
  saveUpload,
  extForMime,
  extForDocMime,
  ACCEPTED_IMAGE_MIME,
  ACCEPTED_DOC_MIME,
} from "@/lib/storage";
import { UPLOAD } from "@/lib/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/upload — multipart upload. Returns `{ url, name, mime, size }`.
 *
 * `kind=doc` accepts course material (PDF / Office / text / zip) for lesson
 * attachments; the default accepts images only, so the thumbnail and avatar
 * pickers can't be talked into storing something else.
 */
export const POST = withRoute(async (req) => {
  await requireApiUser();

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    throw AppError.badRequest("No file was provided.");
  }
  const kind = String(form.get("kind") ?? "image");

  const isDoc = kind === "doc";
  const ext = isDoc ? extForDocMime(file.type) : extForMime(file.type);
  const accepted = isDoc ? ACCEPTED_DOC_MIME : ACCEPTED_IMAGE_MIME;
  if (!ext || !accepted.includes(file.type.split(";")[0].trim())) {
    throw AppError.badRequest(
      isDoc
        ? "Only PDF, Word, PowerPoint, Excel, CSV, text or ZIP files are allowed."
        : "Only JPG, PNG, WebP, AVIF or GIF images are allowed.",
    );
  }

  const maxBytes = isDoc ? UPLOAD.MAX_DOC_BYTES : UPLOAD.MAX_IMAGE_BYTES;
  if (file.size > maxBytes) {
    throw AppError.badRequest(
      isDoc ? "Document must be under 25 MB." : "Image must be under 5 MB.",
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const url = await saveUpload(buffer, ext, file.name);
  return created({ url, name: file.name, mime: file.type, size: file.size });
});

import { z } from "zod";

/**
 * A media address as the admin UI actually produces one: either an absolute
 * http(s) URL, or a site-relative path such as
 * `/api/files/<id>/<name>.png` — which is exactly what POST /api/upload hands
 * back.
 *
 * `z.string().url()` rejects the relative form, so uploading a thumbnail and
 * then saving the course failed with "Enter a valid URL" even though the
 * upload itself had succeeded. Anything that can hold an uploaded file's URL
 * must use this instead.
 */
export const mediaUrl = z
  .string()
  .trim()
  .max(2000)
  .refine(
    (v) => v === "" || v.startsWith("/") || /^https?:\/\/\S+$/i.test(v),
    "Enter a valid URL",
  );

/** `mediaUrl`, but happy with an absent field or an empty string. */
export const optionalMediaUrl = mediaUrl.optional();

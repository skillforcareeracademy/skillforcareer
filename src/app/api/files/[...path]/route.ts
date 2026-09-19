import { snapWidth } from "@/lib/image-sizes";
import { readUpload } from "@/lib/storage";

export const runtime = "nodejs";

/** Photos worth resizing. SVG is already tiny and GIF may be animated. */
const RESIZABLE = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp", "image/avif", "image/tiff"]);
const IMMUTABLE = "public, max-age=31536000, immutable";

/**
 * GET /api/files/<id>/<name.ext> — stream a stored upload.
 *
 * The trailing segment is the file's original name, so `Content-Disposition`
 * can hand the browser back the same filename the admin uploaded.
 *
 * `?w=<px>` on an image returns it resized to that width as WebP — see
 * `src/lib/image-sizes.ts` for why and for the allowed widths.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path: parts } = await params;
  const rel = (Array.isArray(parts) ? parts : [parts]).join("/");

  const file = await readUpload(rel);
  if (!file) return new Response("Not found", { status: 404 });

  const requested = Number(new URL(req.url).searchParams.get("w"));
  if (requested > 0 && RESIZABLE.has(file.mime.toLowerCase())) {
    try {
      const { default: sharp } = await import("sharp");
      const resized = await sharp(file.data)
        .rotate() // honour the camera's EXIF orientation before it is stripped
        .resize({ width: snapWidth(requested), withoutEnlargement: true })
        .webp({ quality: 78 })
        .toBuffer();
      return new Response(new Uint8Array(resized), {
        headers: { "Content-Type": "image/webp", "Cache-Control": IMMUTABLE },
      });
    } catch {
      // A file sharp can't read is still worth sending as uploaded.
    }
  }

  const headers: Record<string, string> = {
    "Content-Type": file.mime,
    "Cache-Control": IMMUTABLE,
  };
  if (file.name) {
    // ASCII fallback plus RFC 5987 form, so non-Latin names survive the trip.
    const ascii = file.name.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "");
    headers["Content-Disposition"] =
      `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(file.name)}`;
  }

  return new Response(new Uint8Array(file.data), { headers });
}

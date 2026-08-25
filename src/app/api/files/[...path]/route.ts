import { readUpload } from "@/lib/storage";

export const runtime = "nodejs";

/**
 * GET /api/files/<id>/<name.ext> — stream a stored upload.
 *
 * The trailing segment is the file's original name, so `Content-Disposition`
 * can hand the browser back the same filename the admin uploaded.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path: parts } = await params;
  const rel = (Array.isArray(parts) ? parts : [parts]).join("/");

  const file = await readUpload(rel);
  if (!file) return new Response("Not found", { status: 404 });

  const headers: Record<string, string> = {
    "Content-Type": file.mime,
    "Cache-Control": "public, max-age=31536000, immutable",
  };
  if (file.name) {
    // ASCII fallback plus RFC 5987 form, so non-Latin names survive the trip.
    const ascii = file.name.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "");
    headers["Content-Disposition"] =
      `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(file.name)}`;
  }

  return new Response(new Uint8Array(file.data), { headers });
}

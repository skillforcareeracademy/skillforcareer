import { readUpload } from "@/lib/storage";

export const runtime = "nodejs";

/** GET /api/files/<name> — stream a locally-stored upload. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path: parts } = await params;
  const rel = (Array.isArray(parts) ? parts : [parts]).join("/");

  const file = await readUpload(rel);
  if (!file) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(file.data), {
    headers: {
      "Content-Type": file.mime,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}

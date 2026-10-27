import { withRoute } from "@/lib/api/handler";
import { AppError } from "@/lib/api/errors";
import { requireApiStaff } from "@/lib/auth/api-guard";
import { recordingsForZip } from "@/server/services/recording-request-service";
import { streamZip } from "@/server/services/export-zip";
import type { Prisma } from "@/generated/prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A batch's worth of class videos can take a while to gather and stream.
export const maxDuration = 300;

/**
 * GET /api/recordings/zip — download recordings as a single ZIP.
 *   ?batch=<id>   one batch's recordings
 *   ?ids=a,b,c    a chosen set
 *   (none)        every recording
 */
export const GET = withRoute(async (req) => {
  await requireApiStaff();
  const sp = new URL(req.url).searchParams;
  const batchId = sp.get("batch");
  const ids = sp
    .get("ids")
    ?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const where: Prisma.MeetingWhereInput = ids?.length
    ? { id: { in: ids } }
    : batchId
      ? { batchId }
      : {};

  const recs = await recordingsForZip(where);
  if (recs.length === 0) throw AppError.notFound("No recordings to download.");

  return streamZip("recordings.zip", async (add) => {
    for (const r of recs) {
      const urlName = r.recordingUrl.split("?")[0].split("/").pop() ?? "";
      const ext = /\.\w{2,5}$/.test(urlName)
        ? urlName.slice(urlName.lastIndexOf("."))
        : ".webm";
      const base = (r.title || "recording").replace(/[/\\]/g, "-").slice(0, 100);
      await add({ path: `${base}${ext}`, fileUrl: r.recordingUrl });
    }
  });
});

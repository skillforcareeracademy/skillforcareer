import { z } from "zod";
import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { deleteMedia, updateMedia } from "@/server/services/media-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({ alt: z.string().trim().max(160).default("") });

/** Relabel a file, so it can be found by what it shows rather than its filename. */
export const PATCH = withRoute(async (req, { params }) => {
  await requireApiPermission(PERMISSIONS.MANAGE_HOMEPAGE);
  const { alt } = patchSchema.parse(await req.json().catch(() => ({})));
  return ok(await updateMedia(String((await params).id), alt));
});

export const DELETE = withRoute(async (_req, { params }) => {
  await requireApiPermission(PERMISSIONS.MANAGE_HOMEPAGE);
  await deleteMedia(String((await params).id));
  return ok({ message: "File removed from the library." });
});

import { z } from "zod";
import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { setMaterialPublished } from "@/server/services/study-material-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ isPublished: z.boolean() });

export const PATCH = withRoute(async (req, { params }) => {
  await requireApiPermission(PERMISSIONS.MANAGE_MATERIAL);
  const id = String((await params).id);
  const { isPublished } = schema.parse(await req.json().catch(() => ({})));
  await setMaterialPublished(id, isPublished);
  return ok({
    message: isPublished ? "Material published." : "Material hidden from learners.",
  });
});

import { z } from "zod";
import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { setWebinarPublished } from "@/server/services/webinar-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ publish: z.boolean() });

export const POST = withRoute(async (req, { params }) => {
  await requireApiPermission(PERMISSIONS.HOST_LIVE_CLASS);
  const id = String((await params).id);
  const { publish } = bodySchema.parse(await req.json().catch(() => ({})));
  await setWebinarPublished(id, publish);
  return ok({ message: publish ? "Webinar published." : "Webinar unpublished." });
});

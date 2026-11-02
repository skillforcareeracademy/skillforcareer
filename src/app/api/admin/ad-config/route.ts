import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { z } from "zod";
import { adConfigStatus, setAdConfig } from "@/server/services/ad-config-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The academy's ad-platform connection settings — connecting Facebook/Google
 * from inside the panel. Behind MANAGE_ADS, so only an admin can set the keys
 * (and a sales agent never sees the secrets behind the connection).
 */
export const GET = withRoute(async () => {
  await requireApiPermission(PERMISSIONS.MANAGE_ADS);
  return ok(await adConfigStatus());
});

// Every field optional: the form sends a secret only when the admin types a new
// one, so an omitted secret keeps the working connection. An empty string is a
// deliberate "disconnect this field".
const bodySchema = z.object({
  metaAppId: z.string().trim().max(200).optional(),
  metaAppSecret: z.string().trim().max(500).optional(),
  metaPageId: z.string().trim().max(200).optional(),
  metaPageToken: z.string().trim().max(2000).optional(),
  metaVerifyToken: z.string().trim().max(200).optional(),
  googleLeadsKey: z.string().trim().max(500).optional(),
});

export const PATCH = withRoute(async (req) => {
  const user = await requireApiPermission(PERMISSIONS.MANAGE_ADS);
  const body = bodySchema.parse(await req.json().catch(() => ({})));
  await setAdConfig(body, user.id);
  return ok({ message: "Ad settings saved." });
});

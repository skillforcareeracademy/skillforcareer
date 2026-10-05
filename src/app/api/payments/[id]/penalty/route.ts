import { z } from "zod";
import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { waivePenalties } from "@/server/services/payment-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ waived: z.boolean() });

/** Forgive — or reinstate — every late fee on one plan. */
export const POST = withRoute(async (req, { params }) => {
  await requireApiPermission(PERMISSIONS.MANAGE_PAYMENTS);
  const id = String((await params).id);
  const { waived } = schema.parse(await req.json().catch(() => ({})));
  await waivePenalties(id, waived);
  return ok({
    message: waived ? "Late fees waived." : "Late fees reinstated.",
  });
});

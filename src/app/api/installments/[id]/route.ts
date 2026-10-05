import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { installmentUpdateSchema } from "@/lib/validations/payment";
import { updateInstallment } from "@/server/services/payment-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Record money against one instalment, move its date, or waive its late fee. */
export const PATCH = withRoute(async (req, { params }) => {
  await requireApiPermission(PERMISSIONS.MANAGE_PAYMENTS);
  const id = String((await params).id);
  const input = installmentUpdateSchema.parse(
    await req.json().catch(() => ({})),
  );
  await updateInstallment(id, input);
  return ok({ message: "Instalment saved." });
});

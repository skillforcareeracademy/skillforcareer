import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { AppError } from "@/lib/api/errors";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import {
  isLegalPageKey,
  saveLegalPageSchema,
  type LegalPageKey,
} from "@/lib/validations/legal";
import { saveLegalPage } from "@/server/services/legal-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function legalKey(raw: unknown): LegalPageKey {
  const key = String(raw);
  if (!isLegalPageKey(key)) throw AppError.notFound("Unknown legal page.");
  return key;
}

export const PATCH = withRoute(async (req, { params }) => {
  // Same capability as the rest of the public-site content.
  const user = await requireApiPermission(PERMISSIONS.MANAGE_HOMEPAGE);
  const key = legalKey((await params).key);
  const input = saveLegalPageSchema.parse(await req.json().catch(() => ({})));
  return ok(await saveLegalPage(key, input, user.id));
});

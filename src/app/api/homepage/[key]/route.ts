import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { AppError } from "@/lib/api/errors";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import {
  isHomeSectionKey,
  updateHomeSectionSchema,
  type HomeSectionKey,
} from "@/lib/validations/homepage";
import { resetHomeSection, updateHomeSection } from "@/server/services/homepage-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sectionKey(raw: unknown): HomeSectionKey {
  const key = String(raw);
  if (!isHomeSectionKey(key)) throw AppError.notFound("Unknown homepage section.");
  return key;
}

export const PATCH = withRoute(async (req, { params }) => {
  const user = await requireApiPermission(PERMISSIONS.MANAGE_HOMEPAGE);
  const key = sectionKey((await params).key);
  const input = updateHomeSectionSchema.parse(await req.json().catch(() => ({})));
  const section = await updateHomeSection(key, input, user.id);
  return ok(section);
});

/** Reset the section's content to what the site shipped with. */
export const DELETE = withRoute(async (_req, { params }) => {
  const user = await requireApiPermission(PERMISSIONS.MANAGE_HOMEPAGE);
  const key = sectionKey((await params).key);
  const section = await resetHomeSection(key, user.id);
  return ok(section);
});

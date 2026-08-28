import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { AppError } from "@/lib/api/errors";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import {
  isPageSectionKey,
  updatePageSectionSchema,
  type PageSectionKey,
} from "@/lib/validations/pages";
import { resetPageSection, updatePageSection } from "@/server/services/page-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sectionKey(raw: unknown): PageSectionKey {
  const key = String(raw);
  if (!isPageSectionKey(key)) throw AppError.notFound("Unknown page section.");
  return key;
}

export const PATCH = withRoute(async (req, { params }) => {
  const user = await requireApiPermission(PERMISSIONS.MANAGE_HOMEPAGE);
  const key = sectionKey((await params).key);
  const input = updatePageSectionSchema.parse(await req.json().catch(() => ({})));
  return ok(await updatePageSection(key, input, user.id));
});

/** Reset the section's content to what the site shipped with. */
export const DELETE = withRoute(async (_req, { params }) => {
  const user = await requireApiPermission(PERMISSIONS.MANAGE_HOMEPAGE);
  const key = sectionKey((await params).key);
  return ok(await resetPageSection(key, user.id));
});

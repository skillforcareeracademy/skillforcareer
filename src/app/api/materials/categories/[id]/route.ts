import { z } from "zod";
import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import {
  deleteMaterialCategory,
  renameMaterialCategory,
} from "@/server/services/material-category-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ name: z.string().trim().min(1).max(80) });

export const PATCH = withRoute(async (req, { params }) => {
  await requireApiPermission(PERMISSIONS.MANAGE_MATERIAL);
  const id = String((await params).id);
  const { name } = schema.parse(await req.json().catch(() => ({})));
  await renameMaterialCategory(id, name);
  return ok({ message: "Renamed." });
});

/** The material underneath is left ungrouped, never deleted. */
export const DELETE = withRoute(async (_req, { params }) => {
  await requireApiPermission(PERMISSIONS.MANAGE_MATERIAL);
  await deleteMaterialCategory(String((await params).id));
  return ok({ message: "Category removed. Its material is now ungrouped." });
});

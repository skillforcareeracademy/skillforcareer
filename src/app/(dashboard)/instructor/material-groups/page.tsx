import type { Metadata } from "next";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { listMaterialCategories } from "@/server/services/material-category-service";
import { MaterialGroupsClient } from "@/components/admin/materials/material-groups-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Material groups" };

/** Grouping on a page of its own, as the quiz groups are. */
export default async function MaterialGroupsPage() {
  await requireApiPermission(PERMISSIONS.MANAGE_MATERIAL);
  const categories = await listMaterialCategories();
  return <MaterialGroupsClient categories={categories} basePath="/instructor/materials" />;
}

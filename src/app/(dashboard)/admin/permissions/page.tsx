import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/require";
import { PERMISSIONS } from "@/config/roles";
import { listRolesWithPermissions, permissionCatalog } from "@/server/services/role-service";
import { PermissionsClient } from "@/components/admin/permissions/permissions-client";

export const metadata: Metadata = { title: "Roles & permissions" };
export const dynamic = "force-dynamic";

export default async function PermissionsPage() {
  await requirePermission(PERMISSIONS.MANAGE_ROLES);
  const [roles, catalog] = await Promise.all([
    listRolesWithPermissions(),
    permissionCatalog(),
  ]);
  return <PermissionsClient roles={roles} catalog={catalog} />;
}

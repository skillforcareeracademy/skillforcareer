import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/require";
import { PERMISSIONS } from "@/config/roles";
import { TerminologyClient } from "@/components/shared/terminology-client";

export const metadata: Metadata = { title: "Terminology" };

export default async function AdminTerminologyPage() {
  await requirePermission(PERMISSIONS.MANAGE_MATERIAL);
  return <TerminologyClient canManage />;
}

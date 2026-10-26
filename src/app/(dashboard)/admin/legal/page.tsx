import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/require";
import { PERMISSIONS } from "@/config/roles";
import { listLegalPages } from "@/server/services/legal-service";
import { LegalClient } from "@/components/admin/legal/legal-client";

export const metadata: Metadata = { title: "Legal pages" };
export const dynamic = "force-dynamic";

export default async function AdminLegalPage() {
  await requirePermission(PERMISSIONS.MANAGE_HOMEPAGE);
  const pages = await listLegalPages();
  return <LegalClient initial={pages} />;
}

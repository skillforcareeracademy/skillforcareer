import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/require";
import { PERMISSIONS } from "@/config/roles";
import { getPageSections } from "@/server/services/page-service";
import { PagesClient } from "@/components/admin/pages/pages-client";
import type { EditableRecord } from "@/components/admin/homepage/types";

export const metadata: Metadata = { title: "Pages" };
export const dynamic = "force-dynamic";

export default async function AdminPagesPage() {
  await requirePermission(PERMISSIONS.MANAGE_HOMEPAGE);
  const sections = await getPageSections();
  // The editor works field-by-field off each section's spec, so it takes the
  // loose shape rather than the server's per-key discriminated union.
  return <PagesClient initial={sections as EditableRecord[]} />;
}

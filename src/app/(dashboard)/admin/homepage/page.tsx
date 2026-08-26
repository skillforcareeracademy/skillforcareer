import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/require";
import { PERMISSIONS } from "@/config/roles";
import { getHomeSections } from "@/server/services/homepage-service";
import { HomepageClient } from "@/components/admin/homepage/homepage-client";
import type { EditableSection } from "@/components/admin/homepage/types";

export const metadata: Metadata = { title: "Homepage" };

export default async function AdminHomepagePage() {
  await requirePermission(PERMISSIONS.MANAGE_HOMEPAGE);
  const sections = await getHomeSections();
  // The editor works field-by-field off the section's spec, so it takes the
  // loose shape rather than the server's per-key discriminated union.
  return <HomepageClient initial={sections as EditableSection[]} />;
}

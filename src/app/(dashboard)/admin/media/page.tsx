import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/require";
import { PERMISSIONS } from "@/config/roles";
import { backfillMediaLibrary, listMedia } from "@/server/services/media-service";
import { MediaClient } from "@/components/admin/media/media-client";

export const metadata: Metadata = { title: "Media" };
export const dynamic = "force-dynamic";

export default async function AdminMediaPage() {
  await requirePermission(PERMISSIONS.MANAGE_HOMEPAGE);
  // Uploads made before the library existed have bytes but no index row, so the
  // page would otherwise open empty on a site that is already full of images.
  await backfillMediaLibrary();
  const page = await listMedia({ pageSize: 48 });
  return <MediaClient initial={page} />;
}

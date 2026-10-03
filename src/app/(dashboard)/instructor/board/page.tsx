import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/require";
import { PERMISSIONS } from "@/config/roles";
import { Whiteboard } from "@/components/shared/whiteboard";

export const metadata: Metadata = { title: "Board" };

export default async function BoardPage() {
  await requirePermission(PERMISSIONS.HOST_LIVE_CLASS);
  return <Whiteboard />;
}

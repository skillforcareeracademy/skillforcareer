import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/require";
import { ROLES } from "@/config/roles";
import { RecycleBinClient } from "@/components/shared/recycle-bin-client";

export const metadata: Metadata = { title: "Recycle bin" };

/**
 * The same bin as the admin panel, narrowed by the service to what this
 * instructor deleted — see `scopeFor` in `trash-service.ts`.
 */
export default async function InstructorRecycleBinPage() {
  await requireRole([ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.INSTRUCTOR]);
  return <RecycleBinClient scopeNote="What you have deleted — restore it here." />;
}

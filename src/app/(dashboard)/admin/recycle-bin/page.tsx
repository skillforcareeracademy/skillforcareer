import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/require";
import { ROLES } from "@/config/roles";
import { RecycleBinClient } from "@/components/shared/recycle-bin-client";

export const metadata: Metadata = { title: "Recycle bin" };

export default async function AdminRecycleBinPage() {
  await requireRole([ROLES.SUPER_ADMIN, ROLES.ADMIN]);
  return (
    <RecycleBinClient scopeNote="Everything deleted across the academy — quizzes, assignments, study material, batch notes, blog posts and learner notes." />
  );
}

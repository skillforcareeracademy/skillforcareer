import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/require";
import { ROLES } from "@/config/roles";
import {
  listCertificatesAdmin,
  certificateStats,
  listUsersForSelect,
  listCoursesForSelect,
  listBatchesForSelect,
  listInstructorsForSelect,
} from "@/server/services/certificate-service";
import { CertificatesClient } from "@/components/admin/certificates/certificates-client";

export const metadata: Metadata = { title: "Certificates" };

function str(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" && v.length ? v : undefined;
}

export default async function CertificatesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireRole([ROLES.SUPER_ADMIN, ROLES.ADMIN]);
  const sp = await searchParams;
  const query = {
    page: Math.max(1, Number(sp.page) || 1),
    pageSize: 10,
    search: str(sp.search),
    courseId: str(sp.course),
    status: str(sp.status),
    type: str(sp.type),
  };

  const [{ certificates, total }, stats, users, courses, batches, instructors] =
    await Promise.all([
      listCertificatesAdmin(query),
      certificateStats(),
      listUsersForSelect(),
      listCoursesForSelect(),
      listBatchesForSelect(),
      listInstructorsForSelect(),
    ]);

  return (
    <CertificatesClient
      certificates={certificates}
      total={total}
      query={query}
      stats={stats}
      users={users}
      courses={courses}
      batches={batches}
      instructors={instructors}
    />
  );
}

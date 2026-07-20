import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/require";
import { ROLES } from "@/config/roles";
import {
  listCertificatesAdmin,
  certificateStats,
} from "@/server/services/certificate-service";
import { CertificatesClient } from "@/components/admin/certificates/certificates-client";

export const metadata: Metadata = { title: "Certificates" };
export const dynamic = "force-dynamic";

function str(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" && v.length ? v : undefined;
}

export default async function InstructorCertificatesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireRole([ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.INSTRUCTOR]);
  const sp = await searchParams;
  const query = {
    page: Math.max(1, Number(sp.page) || 1),
    pageSize: 10,
    search: str(sp.search),
    courseId: str(sp.course),
    status: str(sp.status),
    instructorId: user.id,
  };

  const [{ certificates, total }, stats] = await Promise.all([
    listCertificatesAdmin(query),
    certificateStats(user.id),
  ]);

  return (
    <CertificatesClient
      certificates={certificates}
      total={total}
      query={query}
      stats={stats}
      users={[]}
      courses={[]}
      canManage={false}
      title="Certificates"
      description="Certificates earned by learners across your courses."
    />
  );
}

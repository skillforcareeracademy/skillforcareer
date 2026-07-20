import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/require";
import { ROLES } from "@/config/roles";
import { listStudentCertificates } from "@/server/services/certificate-service";
import { StudentCertificatesClient } from "@/components/student/student-certificates-client";

export const metadata: Metadata = { title: "Certificates" };
export const dynamic = "force-dynamic";

export default async function StudentCertificatesPage() {
  const user = await requireRole([ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.STUDENT]);
  const certificates = await listStudentCertificates(user.id);
  return <StudentCertificatesClient certificates={certificates} />;
}

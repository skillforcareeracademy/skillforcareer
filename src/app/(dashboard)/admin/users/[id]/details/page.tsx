import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/lib/auth/require";
import { ROLES } from "@/config/roles";
import { prisma } from "@/lib/prisma";
import { getStudentDetail } from "@/server/services/student-detail-service";
import { PageHeader } from "@/components/shared/page-header";
import { ButtonLink } from "@/components/shared/button-link";
import { StudentDetailsClient } from "@/components/student/student-details-client";

export const metadata: Metadata = { title: "Student details" };
export const dynamic = "force-dynamic";

/** The office's copy of a learner's onboarding form — nothing locked here. */
export default async function AdminStudentDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole([ROLES.SUPER_ADMIN, ROLES.ADMIN]);
  const { id } = await params;
  const learner = await prisma.user.findUnique({
    where: { id },
    select: { name: true, email: true },
  });
  if (!learner) notFound();
  const view = await getStudentDetail(id);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${learner.name} — details`}
        description={`${learner.email} · you can correct anything here, including what the learner can no longer change.`}
        actions={
          <ButtonLink href={`/admin/users/${id}`} variant="ghost">
            <ArrowLeft className="size-4" /> Profile
          </ButtonLink>
        }
      />
      <StudentDetailsClient view={view} staff userId={id} />
    </div>
  );
}

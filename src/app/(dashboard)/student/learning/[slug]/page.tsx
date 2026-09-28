import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/lib/auth/require";
import { ROLES } from "@/config/roles";
import { getCourseHub } from "@/server/services/course-hub-service";
import { PageHeader } from "@/components/shared/page-header";
import { ButtonLink } from "@/components/shared/button-link";
import { CourseHubView } from "@/components/student/course-hub";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Course" };

/** One course's home: everything set for it, in one place. */
export default async function CourseHubPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const user = await requireRole([ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.STUDENT]);
  const hub = await getCourseHub(user.id, user.email, slug);
  if (!hub) notFound();

  return (
    <div className="space-y-6">
      <PageHeader
        title={hub.course.title}
        description={hub.course.subtitle ?? "Your course, from curriculum to recordings."}
        actions={
          <ButtonLink href="/student/learning" variant="ghost">
            <ArrowLeft className="size-4" /> My Learning
          </ButtonLink>
        }
      />
      <CourseHubView hub={hub} />
    </div>
  );
}

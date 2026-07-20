import { requireRole } from "@/lib/auth/require";
import { ROLES } from "@/config/roles";
import { ComingSoon, titleFromSlug } from "@/components/dashboard/coming-soon";

export default async function InstructorCatchAll({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  await requireRole([ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.INSTRUCTOR]);
  const { slug } = await params;
  return <ComingSoon title={titleFromSlug(slug)} />;
}

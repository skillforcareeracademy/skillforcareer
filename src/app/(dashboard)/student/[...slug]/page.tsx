import { requireRole } from "@/lib/auth/require";
import { ROLES } from "@/config/roles";
import { ComingSoon, titleFromSlug } from "@/components/dashboard/coming-soon";

export default async function StudentCatchAll({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  await requireRole([ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.STUDENT]);
  const { slug } = await params;
  return <ComingSoon title={titleFromSlug(slug)} />;
}

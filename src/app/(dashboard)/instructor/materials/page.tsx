import type { Metadata } from "next";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS, ROLES } from "@/config/roles";
import { prisma } from "@/lib/prisma";
import {
  listMaterials,
  materialStats,
} from "@/server/services/study-material-service";
import { groupOptions } from "@/server/services/content-group-service";
import { MaterialsClient } from "@/components/admin/materials/materials-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Study material" };

/** The academy's reading library. Instructors see their own courses' and batches'. */
export default async function MaterialsPage() {
  const user = await requireApiPermission(PERMISSIONS.MANAGE_MATERIAL);
  const staff = user.roles.some((r) => r === ROLES.SUPER_ADMIN || r === ROLES.ADMIN);
  const ownerId = staff ? undefined : user.id;

  const [materials, stats, groups, courses, batches] = await Promise.all([
    listMaterials({ sort: "sequence" }, ownerId),
    materialStats(ownerId),
    groupOptions("MATERIAL"),
    prisma.course.findMany({
      where: ownerId ? { instructorId: ownerId } : {},
      select: { id: true, title: true },
      orderBy: { title: "asc" },
      take: 300,
    }),
    prisma.batch.findMany({
      where: ownerId
        ? { OR: [{ instructorId: ownerId }, { associates: { some: { userId: ownerId } } }] }
        : {},
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: 300,
    }),
  ]);

  return (
    <MaterialsClient
      materials={materials}
      stats={stats}
      groups={groups}
      courses={courses}
      batches={batches}
      basePath="/instructor"
    />
  );
}

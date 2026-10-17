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

  const [materials, stats, groups, batches] = await Promise.all([
    listMaterials({ sort: "sequence" }, ownerId),
    materialStats(ownerId),
    groupOptions("MATERIAL"),
    prisma.batch.findMany({
      where: ownerId
        ? { OR: [{ instructorId: ownerId }, { associates: { some: { userId: ownerId } } }] }
        : {},
      // `courseId` so the picker can narrow the cohorts to the course that
      // has just been ticked — "course ke according batch filter hi jaane
      // chahiye. It will make selection easier."
      select: { id: true, name: true, courseId: true },
      orderBy: { name: "asc" },
      take: 300,
    }),
  ]);

  // An instructor sees not only the courses they own, but every course one of
  // their batches belongs to — "jis jis course ke liye uske batch bne hue hain
  // wo sab course use dikhne chahiye". A batch assigned to them is reason enough
  // to file reading against its course.
  const batchCourseIds = [
    ...new Set(batches.map((b) => b.courseId).filter((c): c is string => Boolean(c))),
  ];
  const courses = await prisma.course.findMany({
    where: ownerId
      ? { OR: [{ instructorId: ownerId }, { id: { in: batchCourseIds } }] }
      : {},
    select: { id: true, title: true },
    orderBy: { title: "asc" },
    take: 300,
  });

  return (
    <MaterialsClient
      materials={materials}
      stats={stats}
      groups={groups}
      courses={courses}
      batches={batches}
      basePath="/admin"
    />
  );
}

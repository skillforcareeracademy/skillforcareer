/**
 * The curriculum permission: `curriculum:manage`, granted to Super Admin and
 * Admin. Instructors get it only if an admin hands it to them from Roles —
 * "admin and instructor (if admin allows)".
 *
 *   npx tsx --env-file=.env scripts/seed-curriculum-permission.ts
 *
 * Idempotent — safe to run again.
 */
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../src/generated/prisma/client";
import { getMariaDbConfig } from "../src/lib/db-config";
import { PERMISSIONS, ROLES } from "../src/config/roles";

const prisma = new PrismaClient({
  adapter: new PrismaMariaDb(getMariaDbConfig() as ConstructorParameters<typeof PrismaMariaDb>[0]),
});

async function main() {
  const key = PERMISSIONS.MANAGE_CURRICULUM;
  const permission =
    (await prisma.permission.findUnique({ where: { key } })) ??
    (await prisma.permission.create({
      data: {
        key,
        group: "Learning",
        description: "Create and edit the academy's curriculums",
      },
    }));

  const roles = await prisma.role.findMany({
    where: { slug: { in: [ROLES.SUPER_ADMIN, ROLES.ADMIN] } },
    select: { id: true, slug: true },
  });
  for (const role of roles) {
    const has = await prisma.rolePermission.findUnique({
      where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
      select: { roleId: true },
    });
    if (!has) {
      await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });
    }
    console.log(`granted ${key} → ${role.slug}`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

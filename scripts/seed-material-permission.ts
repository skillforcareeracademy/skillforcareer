/**
 * The study-material permission: `material:manage`, granted to Super Admin,
 * Admin and Instructor. An instructor holding it still only reaches their own
 * courses' and batches' material — the service narrows that, not the grant.
 *
 *   npx tsx --env-file=.env scripts/seed-material-permission.ts
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
  const key = PERMISSIONS.MANAGE_MATERIAL;
  const permission =
    (await prisma.permission.findUnique({ where: { key } })) ??
    (await prisma.permission.create({
      data: {
        key,
        group: "Learning",
        description: "Upload and group study material, and see who has read it",
      },
    }));

  const roles = await prisma.role.findMany({
    where: { slug: { in: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.INSTRUCTOR] } },
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

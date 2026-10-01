import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../src/generated/prisma/client";
import { getMariaDbConfig } from "../src/lib/db-config";
import { PERMISSIONS, ROLES } from "../src/config/roles";

/**
 * Grants `broadcasts:send` to Super Admin, Admin and Instructor on a database
 * seeded before the permission existed. Idempotent — safe to re-run.
 *
 *   npx tsx --env-file=.env scripts/grant-broadcast-perm.ts
 */
const prisma = new PrismaClient({
  adapter: new PrismaMariaDb(
    getMariaDbConfig() as ConstructorParameters<typeof PrismaMariaDb>[0],
  ),
});

async function main() {
  const key = PERMISSIONS.SEND_BROADCAST; // broadcasts:send
  const description = "send broadcasts";
  const perm = await prisma.permission.upsert({
    where: { key },
    create: { key, group: "Communication", description },
    update: { group: "Communication", description },
  });

  const roles = await prisma.role.findMany({
    where: { slug: { in: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.INSTRUCTOR] } },
    select: { id: true, slug: true },
  });
  for (const role of roles) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
      create: { roleId: role.id, permissionId: perm.id },
      update: {},
    });
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

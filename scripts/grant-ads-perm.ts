import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../src/generated/prisma/client";
import { getMariaDbConfig } from "../src/lib/db-config";
import { PERMISSIONS, ROLES } from "../src/config/roles";

/**
 * Grants `ads:manage` to Super Admin and Admin only — NOT the sales agent, who
 * works the ad leads but does not connect the ad accounts. Idempotent, so it is
 * safe to re-run on a database seeded before the permission existed.
 *
 *   npx tsx --env-file=.env scripts/grant-ads-perm.ts
 */
const prisma = new PrismaClient({
  adapter: new PrismaMariaDb(
    getMariaDbConfig() as ConstructorParameters<typeof PrismaMariaDb>[0],
  ),
});

async function main() {
  const key = PERMISSIONS.MANAGE_ADS; // ads:manage
  const description = "connect ad accounts and view the Ads dashboard";
  const perm = await prisma.permission.upsert({
    where: { key },
    create: { key, group: "Leads", description },
    update: { group: "Leads", description },
  });

  const roles = await prisma.role.findMany({
    where: { slug: { in: [ROLES.SUPER_ADMIN, ROLES.ADMIN] } },
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

  // A sales agent seeded with the Ads page earlier may be holding ads:manage
  // from a role grant — take it off the sales-agent role so the page is gone.
  const sales = await prisma.role.findUnique({
    where: { slug: ROLES.SALES_AGENT },
    select: { id: true },
  });
  if (sales) {
    const removed = await prisma.rolePermission.deleteMany({
      where: { roleId: sales.id, permissionId: perm.id },
    });
    if (removed.count) console.log(`revoked ${key} ← ${ROLES.SALES_AGENT}`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

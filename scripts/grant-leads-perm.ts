import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../src/generated/prisma/client";
import { getMariaDbConfig } from "../src/lib/db-config";
import { PERMISSIONS, ROLES } from "../src/config/roles";

const prisma = new PrismaClient({ adapter: new PrismaMariaDb(getMariaDbConfig() as ConstructorParameters<typeof PrismaMariaDb>[0]) });

async function main() {
  const key = PERMISSIONS.MANAGE_LEADS; // leads:manage
  const perm = await prisma.permission.upsert({
    where: { key },
    create: { key, group: "Leads", description: "manage leads" },
    update: { group: "Leads", description: "manage leads" },
  });
  // Grant to SUPER_ADMIN + ADMIN
  const roles = await prisma.role.findMany({ where: { slug: { in: [ROLES.SUPER_ADMIN, ROLES.ADMIN] } }, select: { id: true, slug: true } });
  for (const r of roles) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: r.id, permissionId: perm.id } },
      create: { roleId: r.id, permissionId: perm.id },
      update: {},
    });
    console.log(`granted ${key} → ${r.slug}`);
  }
}
main().then(() => prisma.$disconnect()).catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });

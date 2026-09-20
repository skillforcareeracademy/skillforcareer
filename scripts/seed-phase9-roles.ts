/**
 * Phase 9 roles: the Sales Agent role and the placements permission.
 *
 *   npx tsx --env-file=.env scripts/seed-phase9-roles.ts
 *
 * Idempotent — safe to run again. Creates `placements:manage` and grants it to
 * Super Admin and Admin; creates the SALES_AGENT system role with exactly the
 * grants in DEFAULT_ROLE_PERMISSIONS (leads + viewing courses).
 */
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../src/generated/prisma/client";
import { getMariaDbConfig } from "../src/lib/db-config";
import { DEFAULT_ROLE_PERMISSIONS, PERMISSIONS, ROLES, ROLE_LABELS } from "../src/config/roles";

const prisma = new PrismaClient({
  adapter: new PrismaMariaDb(getMariaDbConfig() as ConstructorParameters<typeof PrismaMariaDb>[0]),
});

async function grant(roleId: string, permissionId: string) {
  // A plain existence check rather than upsert: upsert is SELECT-then-INSERT
  // under relationMode = "prisma", and this runs once by hand anyway.
  const has = await prisma.rolePermission.findUnique({
    where: { roleId_permissionId: { roleId, permissionId } },
    select: { roleId: true },
  });
  if (!has) await prisma.rolePermission.create({ data: { roleId, permissionId } });
}

async function main() {
  const key = PERMISSIONS.MANAGE_PLACEMENTS;
  const placements =
    (await prisma.permission.findUnique({ where: { key } })) ??
    (await prisma.permission.create({
      data: { key, group: "Careers", description: "Manage CV applications, placement and hiring partners" },
    }));
  const staff = await prisma.role.findMany({
    where: { slug: { in: [ROLES.SUPER_ADMIN, ROLES.ADMIN] } },
    select: { id: true, slug: true },
  });
  for (const role of staff) {
    await grant(role.id, placements.id);
    console.log(`granted ${key} → ${role.slug}`);
  }

  const sales =
    (await prisma.role.findUnique({ where: { slug: ROLES.SALES_AGENT } })) ??
    (await prisma.role.create({
      data: {
        slug: ROLES.SALES_AGENT,
        name: ROLE_LABELS.SALES_AGENT,
        description: "Works the lead sheet: follow-ups, reminders and payments against leads.",
        isSystem: true,
      },
    }));
  for (const permKey of DEFAULT_ROLE_PERMISSIONS.SALES_AGENT) {
    const perm = await prisma.permission.findUnique({ where: { key: permKey } });
    if (!perm) {
      console.warn(`permission ${permKey} missing — skipped`);
      continue;
    }
    await grant(sales.id, perm.id);
    console.log(`granted ${permKey} → ${ROLES.SALES_AGENT}`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

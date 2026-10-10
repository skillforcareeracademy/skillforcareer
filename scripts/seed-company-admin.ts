/**
 * The Company Admin role, and the academy's own tenant.
 *
 *   npx tsx --env-file=.env scripts/seed-company-admin.ts
 *
 * Idempotent. Creates the COMPANY_ADMIN system role with exactly the grants in
 * DEFAULT_ROLE_PERMISSIONS, and the one owner Company that represents the
 * academy itself — "jo main owner hai ush ka apna tenant hona chaiye".
 *
 * Nothing is moved: the academy's own accounts keep `companyId = null`, which
 * is what the owner tenant means. Backfilling them would be a destructive
 * rewrite of every user row for no gain.
 */
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../src/generated/prisma/client";
import { getMariaDbConfig } from "../src/lib/db-config";
import { DEFAULT_ROLE_PERMISSIONS, ROLES, ROLE_LABELS } from "../src/config/roles";

const prisma = new PrismaClient({
  adapter: new PrismaMariaDb(
    getMariaDbConfig() as ConstructorParameters<typeof PrismaMariaDb>[0],
  ),
});

async function grant(roleId: string, permissionId: string) {
  const has = await prisma.rolePermission.findUnique({
    where: { roleId_permissionId: { roleId, permissionId } },
    select: { roleId: true },
  });
  if (!has) await prisma.rolePermission.create({ data: { roleId, permissionId } });
}

async function main() {
  const role =
    (await prisma.role.findUnique({ where: { slug: ROLES.COMPANY_ADMIN } })) ??
    (await prisma.role.create({
      data: {
        slug: ROLES.COMPANY_ADMIN,
        name: ROLE_LABELS.COMPANY_ADMIN,
        description:
          "Runs one company's training inside the academy's platform, and sees nothing outside it.",
        isSystem: true,
      },
    }));
  console.log(`role ${ROLES.COMPANY_ADMIN} ready`);

  let granted = 0;
  for (const key of DEFAULT_ROLE_PERMISSIONS.COMPANY_ADMIN) {
    const perm = await prisma.permission.findUnique({ where: { key } });
    if (!perm) {
      console.warn(`  permission ${key} missing — skipped`);
      continue;
    }
    await grant(role.id, perm.id);
    granted += 1;
  }
  console.log(`  ${granted} permissions granted`);

  const owner = await prisma.company.findFirst({
    where: { isOwner: true },
    select: { id: true, name: true },
  });
  if (owner) {
    console.log(`owner tenant already here: ${owner.name}`);
    return;
  }

  // Named from the academy's own settings where it has them, so the owner
  // tenant reads as itself in the list rather than as a placeholder. Settings
  // are one JSON blob, not a key per row.
  const settings = await prisma.setting.findUnique({
    where: { id: "global" },
    select: { data: true },
  });
  const blob = (settings?.data ?? null) as { siteName?: unknown } | null;
  const siteName = typeof blob?.siteName === "string" ? blob.siteName.trim() : "";
  const name = siteName || "The academy";

  const made = await prisma.company.create({
    data: { name, isOwner: true, status: "ACTIVE" },
    select: { id: true },
  });
  console.log(`owner tenant created: ${name} (${made.id})`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exitCode = 1;
  });

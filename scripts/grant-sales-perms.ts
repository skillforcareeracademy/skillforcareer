import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../src/generated/prisma/client";
import { getMariaDbConfig } from "../src/lib/db-config";
import { PERMISSIONS, ROLES } from "../src/config/roles";

/**
 * The scoped lead & payment permissions for a sales agent — "view leads, edit
 * leads, view payments, edit payments, only her own". Creates the four perms so
 * they appear in the permission dialog, grants them to the Sales Agent role, and
 * takes the all-access `leads:manage` off that role so existing agents drop to
 * their own leads. Admins keep leads:manage / payments:manage, untouched.
 *
 * Idempotent — safe to re-run.
 *   npx tsx --env-file=.env scripts/grant-sales-perms.ts
 */
const prisma = new PrismaClient({
  adapter: new PrismaMariaDb(
    getMariaDbConfig() as ConstructorParameters<typeof PrismaMariaDb>[0],
  ),
});

const PERMS: { key: string; group: string; description: string }[] = [
  { key: PERMISSIONS.VIEW_OWN_LEADS, group: "Leads", description: "view own leads" },
  { key: PERMISSIONS.EDIT_OWN_LEADS, group: "Leads", description: "edit own leads" },
  { key: PERMISSIONS.VIEW_OWN_PAYMENTS, group: "Payments", description: "view own payments" },
  { key: PERMISSIONS.EDIT_OWN_PAYMENTS, group: "Payments", description: "edit own payments" },
];

async function main() {
  const ids: string[] = [];
  for (const p of PERMS) {
    const perm = await prisma.permission.upsert({
      where: { key: p.key },
      create: { key: p.key, group: p.group, description: p.description },
      update: { group: p.group, description: p.description },
    });
    ids.push(perm.id);
    console.log(`permission ready: ${p.key}`);
  }

  const sales = await prisma.role.findUnique({
    where: { slug: ROLES.SALES_AGENT },
    select: { id: true },
  });
  if (!sales) {
    console.log("No Sales Agent role found — perms created, nothing to grant.");
    return;
  }

  for (const permissionId of ids) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: sales.id, permissionId } },
      create: { roleId: sales.id, permissionId },
      update: {},
    });
  }
  console.log(`granted ${ids.length} own-scoped perms → ${ROLES.SALES_AGENT}`);

  // Drop the all-access leads:manage from the role so agents are own-only.
  const manage = await prisma.permission.findUnique({
    where: { key: PERMISSIONS.MANAGE_LEADS },
    select: { id: true },
  });
  if (manage) {
    const removed = await prisma.rolePermission.deleteMany({
      where: { roleId: sales.id, permissionId: manage.id },
    });
    if (removed.count) console.log(`revoked ${PERMISSIONS.MANAGE_LEADS} ← ${ROLES.SALES_AGENT}`);
  }

  // A sales agent granted leads:manage directly (a per-person override) would
  // still see everyone's leads — surface that so it can be cleared by hand.
  const stragglers = await prisma.userPermission.findMany({
    where: { allow: true, permission: { key: PERMISSIONS.MANAGE_LEADS }, user: { role: { slug: ROLES.SALES_AGENT } } },
    select: { user: { select: { name: true, email: true } } },
  });
  if (stragglers.length) {
    console.log("\n⚠ These sales agents still hold leads:manage as a personal override — untick it in Users → Permissions:");
    for (const s of stragglers) console.log(`   • ${s.user.name} <${s.user.email}>`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

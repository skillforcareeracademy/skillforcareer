import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../src/generated/prisma/client";
import { getMariaDbConfig } from "../src/lib/db-config";
import { hashPassword } from "../src/lib/auth/password";
import {
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSIONS,
  ROLE_LABELS,
  ROLES,
  type Permission,
  type Role,
} from "../src/config/roles";

/**
 * Seeds the RBAC catalog: the full permission set and the four built-in
 * (system) roles with their default grants — the source-of-truth for
 * authorization. Idempotent (upserts), so it is safe to re-run.
 *
 * Run with: npm run db:seed
 */
const prisma = new PrismaClient({
  adapter: new PrismaMariaDb(
    getMariaDbConfig() as ConstructorParameters<typeof PrismaMariaDb>[0],
  ),
});

/** Human-readable group + description for a `resource:action` permission key. */
function describe(key: Permission): { group: string; description: string } {
  const [resource, action, scope] = key.split(":");
  const group = resource.charAt(0).toUpperCase() + resource.slice(1);
  const description = `${action}${scope ? ` (${scope})` : ""} ${resource}`;
  return { group, description };
}

async function main() {
  // 1. Permissions
  const allPermissions = Object.values(PERMISSIONS);
  for (const key of allPermissions) {
    const { group, description } = describe(key);
    await prisma.permission.upsert({
      where: { key },
      create: { key, group, description },
      update: { group, description },
    });
  }
  console.log(`✔ Seeded ${allPermissions.length} permissions`);

  // 2. Roles + their default permission grants
  const roleNames = Object.values(ROLES) as Role[];
  for (const slug of roleNames) {
    const role = await prisma.role.upsert({
      where: { slug },
      create: { slug, name: ROLE_LABELS[slug], isSystem: true },
      update: { name: ROLE_LABELS[slug], isSystem: true },
    });

    const grants = DEFAULT_ROLE_PERMISSIONS[slug];
    const permissions = await prisma.permission.findMany({
      where: { key: { in: grants } },
      select: { id: true },
    });

    for (const permission of permissions) {
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: { roleId: role.id, permissionId: permission.id },
        },
        create: { roleId: role.id, permissionId: permission.id },
        update: {},
      });
    }
    console.log(`✔ Role ${slug}: ${permissions.length} permissions`);
  }

  // 3. Super admin (development/testing login)
  const superRole = await prisma.role.findUnique({
    where: { slug: ROLES.SUPER_ADMIN },
  });
  if (superRole) {
    // Remove any legacy default admin so only the current one exists.
    await prisma.user.deleteMany({
      where: { email: "admin@skillforcareer.com" },
    });

    const email = "joshicloudindia@gmail.com";
    const passwordHash = await hashPassword("1234567890");
    await prisma.user.upsert({
      where: { email },
      create: {
        name: "Super Admin",
        email,
        passwordHash,
        roleId: superRole.id,
        status: "ACTIVE",
        emailVerified: new Date(),
      },
      update: {
        passwordHash,
        roleId: superRole.id,
        status: "ACTIVE",
        emailVerified: new Date(),
      },
    });
    console.log(`✔ Super admin: ${email} / 1234567890`);
  }

  // 4. Course categories
  const categories = [
    { name: "Data Science", slug: "data-science", order: 1 },
    { name: "AI & Machine Learning", slug: "ai-ml", order: 2 },
    { name: "Management & MBA", slug: "management", order: 3 },
    { name: "Software Development", slug: "software-development", order: 4 },
    { name: "Digital Marketing", slug: "digital-marketing", order: 5 },
    { name: "Product Management", slug: "product-management", order: 6 },
    { name: "Cloud & DevOps", slug: "cloud-devops", order: 7 },
    { name: "Design & UX", slug: "design", order: 8 },
  ];
  for (const cat of categories) {
    await prisma.category.upsert({
      where: { slug: cat.slug },
      create: { name: cat.name, slug: cat.slug, order: cat.order, isActive: true },
      update: { name: cat.name, order: cat.order },
    });
  }
  console.log(`✔ Seeded ${categories.length} categories`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
    console.log("🌱 Seed complete");
  })
  .catch(async (err) => {
    console.error("❌ Seed failed:", err);
    await prisma.$disconnect();
    process.exit(1);
  });

/**
 * A throwaway company to test tenant isolation against.
 *
 *   npx tsx --env-file=.env scripts/demo-tenant.ts          # create
 *   npx tsx --env-file=.env scripts/demo-tenant.ts --remove # clean up
 *
 * Everything it makes is prefixed `tenant-test` so it is obvious in the live
 * data and removable in one go. Nothing real is touched: it creates its own
 * company and its own people, and `--remove` takes exactly those away again.
 */
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../src/generated/prisma/client";
import { getMariaDbConfig } from "../src/lib/db-config";
import { hashPassword } from "../src/lib/auth/password";
import { ROLES } from "../src/config/roles";

const prisma = new PrismaClient({
  adapter: new PrismaMariaDb(
    getMariaDbConfig() as ConstructorParameters<typeof PrismaMariaDb>[0],
  ),
});

const COMPANY = "Tenant Test Pvt Ltd";
const ADMIN_EMAIL = "tenant-test.admin@skillforcareer.com";
const LEARNER_EMAIL = "tenant-test.learner@skillforcareer.com";
const PASSWORD = "TenantTest#2026";

async function remove() {
  const company = await prisma.company.findFirst({
    where: { name: COMPANY },
    select: { id: true },
  });
  const emails = [ADMIN_EMAIL, LEARNER_EMAIL];
  const users = await prisma.user.findMany({
    where: { email: { in: emails } },
    select: { id: true },
  });
  for (const u of users) {
    await prisma.refreshToken.deleteMany({ where: { userId: u.id } });
    await prisma.user.delete({ where: { id: u.id } });
  }
  if (company) await prisma.company.delete({ where: { id: company.id } });
  console.log(`removed ${users.length} test accounts${company ? " and the test company" : ""}.`);
}

async function create() {
  const [adminRole, studentRole] = await Promise.all([
    prisma.role.findUnique({ where: { slug: ROLES.COMPANY_ADMIN }, select: { id: true } }),
    prisma.role.findUnique({ where: { slug: ROLES.STUDENT }, select: { id: true } }),
  ]);
  if (!adminRole || !studentRole) {
    throw new Error("Run scripts/seed-company-admin.ts first.");
  }

  const company =
    (await prisma.company.findFirst({ where: { name: COMPANY }, select: { id: true } })) ??
    (await prisma.company.create({
      data: {
        name: COMPANY,
        status: "ACTIVE",
        contactName: "Test Contact",
        email: "owner@tenant-test.example",
        plan: "Annual",
        // Deliberately small, so the seat limit can be hit by hand in a minute.
        maxStudents: 2,
        maxInstructors: 1,
        maxAdmins: 1,
        maxSalesAgents: 0,
      },
      select: { id: true },
    }));

  const passwordHash = await hashPassword(PASSWORD);
  for (const [email, name, roleId] of [
    [ADMIN_EMAIL, "Tenant Test Admin", adminRole.id],
    [LEARNER_EMAIL, "Tenant Test Learner", studentRole.id],
  ] as const) {
    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) {
      await prisma.user.update({
        where: { id: existing.id },
        data: { passwordHash, companyId: company.id, roleId, status: "ACTIVE" },
      });
      console.log(`updated ${email}`);
      continue;
    }
    await prisma.user.create({
      data: {
        name,
        email,
        passwordHash,
        roleId,
        companyId: company.id,
        status: "ACTIVE",
        emailVerified: new Date(),
      },
    });
    console.log(`created ${email}`);
  }

  console.log(`
Company .......... ${COMPANY}  (2 learner seats, 1 instructor, 1 admin, 0 sales)
Company admin .... ${ADMIN_EMAIL}
Test learner ..... ${LEARNER_EMAIL}
Password ......... ${PASSWORD}

Clean up with:  npx tsx --env-file=.env scripts/demo-tenant.ts --remove`);
}

(process.argv.includes("--remove") ? remove() : create())
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exitCode = 1;
  });

import { randomBytes } from "node:crypto";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../src/generated/prisma/client";
import { getMariaDbConfig } from "../src/lib/db-config";
import { ROLES } from "../src/config/roles";

/**
 * Seeds sample certificates so /admin/certificates has content. Issued to the
 * seeded super admin (the only user) for a few courses. Idempotent: skips
 * (user, course) pairs that already have a certificate.
 *
 * Run:    npx tsx --env-file=.env scripts/seed-certificates.ts
 * Clean:  npx tsx --env-file=.env scripts/seed-certificates.ts --clean
 */
const prisma = new PrismaClient({
  adapter: new PrismaMariaDb(
    getMariaDbConfig() as ConstructorParameters<typeof PrismaMariaDb>[0],
  ),
});

function code(len: number): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i += 1) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

const CERTS: { courseSlug: string; status: "ISSUED" | "REVOKED" }[] = [
  { courseSlug: "complete-data-science-bootcamp-python", status: "ISSUED" },
  { courseSlug: "full-stack-web-development-react-node", status: "ISSUED" },
  { courseSlug: "digital-marketing-masterclass-2026", status: "ISSUED" },
  { courseSlug: "aws-certified-cloud-practitioner", status: "REVOKED" },
];

async function courseIds() {
  const slugs = CERTS.map((c) => c.courseSlug);
  const courses = await prisma.course.findMany({
    where: { slug: { in: slugs } },
    select: { id: true, slug: true, title: true },
  });
  return new Map(courses.map((c) => [c.slug, c]));
}

async function main() {
  const admin = await prisma.user.findFirst({
    where: { role: { slug: ROLES.SUPER_ADMIN } },
    select: { id: true, name: true },
  });
  if (!admin) throw new Error("No SUPER_ADMIN user found — run `npm run db:seed` first.");

  const bySlug = await courseIds();

  if (process.argv.includes("--clean")) {
    const ids = [...bySlug.values()].map((c) => c.id);
    const res = await prisma.certificate.deleteMany({
      where: { userId: admin.id, courseId: { in: ids } },
    });
    console.log(`Removed ${res.count} sample certificate(s).`);
    return;
  }

  const year = new Date().getFullYear();
  let created = 0;
  for (const c of CERTS) {
    const course = bySlug.get(c.courseSlug);
    if (!course) {
      console.log(`skip (no course ${c.courseSlug})`);
      continue;
    }
    const exists = await prisma.certificate.findUnique({
      where: { userId_courseId: { userId: admin.id, courseId: course.id } },
      select: { id: true },
    });
    if (exists) {
      console.log(`skip (exists): ${course.title}`);
      continue;
    }
    await prisma.certificate.create({
      data: {
        userId: admin.id,
        courseId: course.id,
        serialNumber: `SFC-${year}-${code(6)}`,
        verificationCode: code(10),
        status: c.status,
        metadata: { studentName: admin.name, courseTitle: course.title },
      },
    });
    created += 1;
    console.log(`created: ${course.title} (${c.status})`);
  }
  console.log(`\nDone. Created ${created}; recipient: ${admin.name}.`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../src/generated/prisma/client";
import { getMariaDbConfig } from "../src/lib/db-config";
import { ROLES } from "../src/config/roles";

/**
 * Seeds sample batches (cohorts) for the seeded courses so /admin/batches has
 * content. Idempotent: skips any batch whose code already exists.
 *
 * Run:    npx tsx --env-file=.env scripts/seed-batches.ts
 * Clean:  npx tsx --env-file=.env scripts/seed-batches.ts --clean
 */
const prisma = new PrismaClient({
  adapter: new PrismaMariaDb(
    getMariaDbConfig() as ConstructorParameters<typeof PrismaMariaDb>[0],
  ),
});

type St = "UPCOMING" | "ONGOING" | "COMPLETED" | "CANCELLED";

interface Seed {
  code: string;
  name: string;
  courseSlug: string;
  status: St;
  capacity: number;
  enrolled: number;
  start: string;
  end: string | null;
  days: string[];
  startTime: string;
  endTime: string;
}

const BATCHES: Seed[] = [
  {
    code: "DS-AUG26-WD",
    name: "Data Science — Aug 2026 (Weekday)",
    courseSlug: "complete-data-science-bootcamp-python",
    status: "ONGOING", capacity: 60, enrolled: 42,
    start: "2026-08-01", end: "2026-11-30",
    days: ["Mon", "Tue", "Wed", "Thu", "Fri"], startTime: "19:00", endTime: "21:00",
  },
  {
    code: "DS-SEP26-WE",
    name: "Data Science — Sep 2026 (Weekend)",
    courseSlug: "complete-data-science-bootcamp-python",
    status: "UPCOMING", capacity: 50, enrolled: 18,
    start: "2026-09-06", end: "2027-01-31",
    days: ["Sat", "Sun"], startTime: "10:00", endTime: "13:00",
  },
  {
    code: "FS-JUL26",
    name: "Full-Stack Cohort — Jul 2026",
    courseSlug: "full-stack-web-development-react-node",
    status: "ONGOING", capacity: 40, enrolled: 40,
    start: "2026-07-15", end: "2026-10-15",
    days: ["Mon", "Wed", "Fri"], startTime: "20:00", endTime: "22:00",
  },
  {
    code: "DM-JUN26",
    name: "Digital Marketing — Jun 2026",
    courseSlug: "digital-marketing-masterclass-2026",
    status: "COMPLETED", capacity: 45, enrolled: 45,
    start: "2026-06-01", end: "2026-07-30",
    days: ["Tue", "Thu"], startTime: "18:30", endTime: "20:30",
  },
  {
    code: "ML-OCT26",
    name: "Machine Learning — Oct 2026 (Weekend)",
    courseSlug: "machine-learning-a-z-hands-on",
    status: "UPCOMING", capacity: 35, enrolled: 12,
    start: "2026-10-04", end: "2027-02-28",
    days: ["Sat"], startTime: "09:00", endTime: "12:00",
  },
  {
    code: "AWS-AUG26",
    name: "AWS Practitioner — Aug 2026",
    courseSlug: "aws-certified-cloud-practitioner",
    status: "UPCOMING", capacity: 30, enrolled: 8,
    start: "2026-08-20", end: "2026-10-20",
    days: ["Wed", "Fri"], startTime: "19:00", endTime: "21:00",
  },
];

const CODES = BATCHES.map((b) => b.code);

async function clean() {
  const res = await prisma.batch.deleteMany({ where: { code: { in: CODES } } });
  console.log(`Removed ${res.count} sample batch(es).`);
}

async function main() {
  if (process.argv.includes("--clean")) {
    await clean();
    return;
  }

  const instructor = await prisma.user.findFirst({
    where: { role: { slug: ROLES.SUPER_ADMIN } },
    select: { id: true, name: true },
  });
  if (!instructor) throw new Error("No SUPER_ADMIN user found — run `npm run db:seed` first.");

  let created = 0;
  for (const b of BATCHES) {
    const exists = await prisma.batch.findUnique({ where: { code: b.code }, select: { id: true } });
    if (exists) {
      console.log(`skip (exists): ${b.code}`);
      continue;
    }
    const course = await prisma.course.findUnique({
      where: { slug: b.courseSlug },
      select: { id: true },
    });
    if (!course) {
      console.log(`skip (no course ${b.courseSlug}): ${b.code}`);
      continue;
    }
    await prisma.batch.create({
      data: {
        code: b.code,
        name: b.name,
        courseId: course.id,
        instructorId: instructor.id,
        status: b.status,
        capacity: b.capacity,
        enrolledCount: b.enrolled,
        startDate: new Date(`${b.start}T00:00:00.000Z`),
        endDate: b.end ? new Date(`${b.end}T00:00:00.000Z`) : null,
        schedule: { days: b.days, startTime: b.startTime, endTime: b.endTime },
      },
    });
    created += 1;
    console.log(`created: ${b.code} (${b.status})`);
  }
  console.log(`\nDone. Created ${created}; instructor: ${instructor.name}.`);
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

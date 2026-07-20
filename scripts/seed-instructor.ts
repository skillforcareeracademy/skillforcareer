import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../src/generated/prisma/client";
import { getMariaDbConfig } from "../src/lib/db-config";
import { hashPassword } from "../src/lib/auth/password";
import { ROLES } from "../src/config/roles";

/**
 * Seeds a test INSTRUCTOR and gives them ownership of a couple of courses (with
 * real enrolled students), a few hosted live classes, and a submission awaiting
 * grading — so the instructor workspace is populated end-to-end.
 *
 *   Test instructor:  instructor@skillforcareer.com  /  instructor123
 *
 * Run:    npx tsx --env-file=.env scripts/seed-instructor.ts
 * Clean:  npx tsx --env-file=.env scripts/seed-instructor.ts --clean
 */
const prisma = new PrismaClient({
  adapter: new PrismaMariaDb(
    getMariaDbConfig() as ConstructorParameters<typeof PrismaMariaDb>[0],
  ),
});

const INSTRUCTOR_EMAIL = "instructor@skillforcareer.com";
const OWNED_SLUGS = [
  "complete-data-science-bootcamp-python",
  "machine-learning-a-z-hands-on",
];
const HOSTED_ROOMS = ["sfc-live-ds1", "sfc-ds-upcoming", "sfc-mlx-102"];
const ASSIGNMENT_TITLE = "Capstone: EDA on a real-world dataset";

async function superAdminId(): Promise<string> {
  const u = await prisma.user.findUnique({
    where: { email: "joshicloudindia@gmail.com" },
    select: { id: true },
  });
  if (!u) throw new Error("super admin missing — run `npm run db:seed` first.");
  return u.id;
}

async function clean() {
  const admin = await superAdminId();
  const instructor = await prisma.user.findUnique({
    where: { email: INSTRUCTOR_EMAIL },
    select: { id: true },
  });
  // Revert ownership so the FK to the instructor can be removed.
  await prisma.course.updateMany({
    where: { slug: { in: OWNED_SLUGS } },
    data: { instructorId: admin },
  });
  await prisma.meeting.updateMany({
    where: { roomCode: { in: HOSTED_ROOMS } },
    data: { hostId: admin },
  });
  const assignment = await prisma.assignment.findFirst({
    where: { title: ASSIGNMENT_TITLE },
    select: { id: true },
  });
  if (assignment) {
    await prisma.assignmentSubmission.deleteMany({ where: { assignmentId: assignment.id } });
    await prisma.assignment.delete({ where: { id: assignment.id } });
  }
  if (instructor) {
    await prisma.user.delete({ where: { id: instructor.id } });
    console.log("Removed test instructor + reverted course/meeting ownership.");
  } else {
    console.log("No test instructor to remove.");
  }
}

async function main() {
  if (process.argv.includes("--clean")) {
    await clean();
    return;
  }

  const role = await prisma.role.findUnique({ where: { slug: ROLES.INSTRUCTOR }, select: { id: true } });
  if (!role) throw new Error("INSTRUCTOR role missing — run `npm run db:seed` first.");

  const passwordHash = await hashPassword("instructor123");
  const instructor = await prisma.user.upsert({
    where: { email: INSTRUCTOR_EMAIL },
    update: { passwordHash, status: "ACTIVE", emailVerified: new Date() },
    create: {
      email: INSTRUCTOR_EMAIL,
      name: "Rahul Verma",
      passwordHash,
      roleId: role.id,
      status: "ACTIVE",
      emailVerified: new Date(),
      headline: "Data Science & ML Instructor",
      avatarUrl:
        "https://images.pexels.com/photos/2379004/pexels-photo-2379004.jpeg?auto=compress&cs=tinysrgb&w=200&h=200&fit=crop&crop=faces",
    },
    select: { id: true, name: true },
  });
  console.log(`instructor ready: ${instructor.name} <${INSTRUCTOR_EMAIL}> / instructor123`);

  // Own a couple of courses (that already have enrolled students).
  const courses = await prisma.course.findMany({
    where: { slug: { in: OWNED_SLUGS } },
    select: { id: true, slug: true, title: true },
  });
  await prisma.course.updateMany({
    where: { slug: { in: OWNED_SLUGS } },
    data: { instructorId: instructor.id },
  });
  console.log(`assigned ${courses.length} courses to the instructor.`);

  // Host a few live classes.
  const hosted = await prisma.meeting.updateMany({
    where: { roomCode: { in: HOSTED_ROOMS } },
    data: { hostId: instructor.id },
  });
  console.log(`set instructor as host on ${hosted.count} meetings.`);

  // A submission awaiting grading, on the instructor's Data Science course.
  const ds = courses.find((c) => c.slug === OWNED_SLUGS[0]);
  const student = await prisma.user.findUnique({
    where: { email: "student@skillforcareer.com" },
    select: { id: true },
  });
  if (ds && student) {
    let assignment = await prisma.assignment.findFirst({
      where: { title: ASSIGNMENT_TITLE, courseId: ds.id },
      select: { id: true },
    });
    if (!assignment) {
      assignment = await prisma.assignment.create({
        data: {
          title: ASSIGNMENT_TITLE,
          courseId: ds.id,
          createdById: instructor.id,
          description: "Perform exploratory data analysis and summarise your findings.",
          instructions: "Submit a notebook link with visualisations and a short writeup.",
          maxScore: 20,
          allowLate: true,
        },
        select: { id: true },
      });
    }
    await prisma.assignmentSubmission.upsert({
      where: {
        assignmentId_studentId_attempt: {
          assignmentId: assignment.id,
          studentId: student.id,
          attempt: 1,
        },
      },
      update: { status: "SUBMITTED", submittedAt: new Date(), score: null, gradedById: null, gradedAt: null },
      create: {
        assignmentId: assignment.id,
        studentId: student.id,
        attempt: 1,
        status: "SUBMITTED",
        content: "Here is my EDA notebook: https://example.com/notebook — key findings attached.",
        submittedAt: new Date(),
      },
    });
    console.log("seeded 1 submission awaiting grading (Data Science).");
  }

  console.log("\nDone. Sign in as instructor@skillforcareer.com / instructor123");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

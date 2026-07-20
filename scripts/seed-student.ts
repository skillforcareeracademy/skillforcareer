import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../src/generated/prisma/client";
import { getMariaDbConfig } from "../src/lib/db-config";
import { hashPassword } from "../src/lib/auth/password";
import { ROLES } from "../src/config/roles";

/**
 * Seeds a test STUDENT account and gives every VIDEO lesson a playable video
 * (free Pexels clips) so the course player works end-to-end.
 *
 *   Test learner:  student@skillforcareer.com  /  student123
 *
 * Run:    npx tsx --env-file=.env scripts/seed-student.ts
 * Clean:  npx tsx --env-file=.env scripts/seed-student.ts --clean
 */
const prisma = new PrismaClient({
  adapter: new PrismaMariaDb(
    getMariaDbConfig() as ConstructorParameters<typeof PrismaMariaDb>[0],
  ),
});

const STUDENT_EMAIL = "student@skillforcareer.com";

const VIDEOS = [
  "https://videos.pexels.com/video-files/3255275/3255275-uhd_2560_1440_25fps.mp4",
  "https://videos.pexels.com/video-files/3130284/3130284-uhd_2560_1440_30fps.mp4",
  "https://videos.pexels.com/video-files/3252919/3252919-uhd_2560_1440_25fps.mp4",
  "https://videos.pexels.com/video-files/3141210/3141210-uhd_3840_2160_25fps.mp4",
  "https://videos.pexels.com/video-files/2887463/2887463-hd_1920_1080_25fps.mp4",
  "https://videos.pexels.com/video-files/3191572/3191572-uhd_2560_1440_25fps.mp4",
  "https://videos.pexels.com/video-files/3209211/3209211-uhd_2560_1440_25fps.mp4",
  "https://videos.pexels.com/video-files/3249935/3249935-uhd_3840_2160_25fps.mp4",
];

async function clean() {
  const s = await prisma.user.findUnique({ where: { email: STUDENT_EMAIL }, select: { id: true } });
  if (s) {
    await prisma.user.delete({ where: { id: s.id } });
    console.log("Removed test student (cascades enrolments/progress/notes).");
  } else {
    console.log("No test student to remove.");
  }
}

async function main() {
  if (process.argv.includes("--clean")) {
    await clean();
    return;
  }

  // 1. Test student
  const studentRole = await prisma.role.findUnique({
    where: { slug: ROLES.STUDENT },
    select: { id: true },
  });
  if (!studentRole) throw new Error("STUDENT role missing — run `npm run db:seed` first.");

  const passwordHash = await hashPassword("student123");
  const student = await prisma.user.upsert({
    where: { email: STUDENT_EMAIL },
    update: { passwordHash, status: "ACTIVE", emailVerified: new Date() },
    create: {
      email: STUDENT_EMAIL,
      name: "Ananya Sharma",
      passwordHash,
      roleId: studentRole.id,
      status: "ACTIVE",
      emailVerified: new Date(),
      avatarUrl: "https://images.pexels.com/photos/7580822/pexels-photo-7580822.jpeg?auto=compress&cs=tinysrgb&w=200&h=200&fit=crop&crop=faces",
    },
    select: { id: true, name: true },
  });
  console.log(`student ready: ${student.name} <${STUDENT_EMAIL}> / student123`);

  // 2. Give video lessons a playable Video
  const lessons = await prisma.lesson.findMany({
    where: { type: "VIDEO", video: { is: null } },
    select: { id: true, durationSeconds: true },
    orderBy: { createdAt: "asc" },
  });
  let created = 0;
  for (let i = 0; i < lessons.length; i += 1) {
    await prisma.video.create({
      data: {
        lessonId: lessons[i].id,
        url: VIDEOS[i % VIDEOS.length],
        provider: "external",
        durationSeconds: lessons[i].durationSeconds || 480,
      },
    });
    created += 1;
  }
  console.log(`Attached videos to ${created} lesson(s).`);
  console.log("\nDone.");
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

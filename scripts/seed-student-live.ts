import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../src/generated/prisma/client";
import { getMariaDbConfig } from "../src/lib/db-config";

const prisma = new PrismaClient({
  adapter: new PrismaMariaDb(getMariaDbConfig() as ConstructorParameters<typeof PrismaMariaDb>[0]),
});

async function main() {
  const clean = process.argv.includes("--clean");
  const host = await prisma.user.findUnique({ where: { email: "joshicloudindia@gmail.com" }, select: { id: true } });
  const ds = await prisma.course.findUnique({ where: { slug: "complete-data-science-bootcamp-python" }, select: { id: true } });
  if (!host || !ds) throw new Error("host/course missing");

  const UPCOMING = "sfc-ds-upcoming";
  // Hotlink-verified Pexels sample (206 on ranged GET). Wrong filename/res for an id → 403.
  const RECORDING = "https://videos.pexels.com/video-files/5527786/5527786-hd_1920_1080_25fps.mp4";

  if (clean) {
    await prisma.meeting.deleteMany({ where: { roomCode: UPCOMING } });
    await prisma.meeting.updateMany({ where: { roomCode: "sfc-aws-kick" }, data: { recordingUrl: null } });
    console.log("cleaned student-live extras");
    return;
  }

  const start = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000); // +2 days
  const end = new Date(start.getTime() + 90 * 60 * 1000);
  await prisma.meeting.upsert({
    where: { roomCode: UPCOMING },
    create: {
      roomCode: UPCOMING,
      title: "Feature Engineering Workshop",
      description: "Hands-on session on building features from raw data — bring your notebooks.",
      status: "SCHEDULED",
      courseId: ds.id,
      hostId: host.id,
      scheduledStart: start,
      scheduledEnd: end,
      maxParticipants: 100,
      isRecordingEnabled: true,
    },
    update: { scheduledStart: start, scheduledEnd: end, status: "SCHEDULED" },
  });

  // Attach a recording to the ended AWS kickoff so "Watch recording" shows.
  await prisma.meeting.updateMany({
    where: { roomCode: "sfc-aws-kick" },
    data: { recordingUrl: RECORDING },
  });

  console.log("seeded: 1 upcoming Data Science class + recording on AWS kickoff");
}

main().then(() => prisma.$disconnect()).catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });

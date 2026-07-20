import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../src/generated/prisma/client";
import { getMariaDbConfig } from "../src/lib/db-config";
import { ROLES } from "../src/config/roles";

/**
 * Seeds sample live classes (Meetings) so /admin/live has content. Idempotent:
 * skips any meeting whose roomCode already exists.
 *
 * Run:    npx tsx --env-file=.env scripts/seed-meetings.ts
 * Clean:  npx tsx --env-file=.env scripts/seed-meetings.ts --clean
 */
const prisma = new PrismaClient({
  adapter: new PrismaMariaDb(
    getMariaDbConfig() as ConstructorParameters<typeof PrismaMariaDb>[0],
  ),
});

type St = "SCHEDULED" | "LIVE" | "ENDED" | "CANCELLED";

interface Seed {
  roomCode: string;
  title: string;
  description: string;
  courseSlug: string | null;
  batchCode: string | null;
  status: St;
  start: string;
  end: string | null;
  maxParticipants: number | null;
  recording: boolean;
  recordingUrl?: string | null;
}

const MEETINGS: Seed[] = [
  {
    roomCode: "sfc-live-ds1",
    title: "Live Q&A — Data Science Bootcamp",
    description: "Weekly doubt-clearing and hands-on walkthrough with the mentor.",
    courseSlug: "complete-data-science-bootcamp-python",
    batchCode: "DS-AUG26-WD",
    status: "LIVE",
    start: "2026-07-19T10:00:00",
    end: "2026-07-19T11:30:00",
    maxParticipants: 100,
    recording: true,
  },
  {
    roomCode: "sfc-mlx-102",
    title: "Intro to Neural Networks — Live Session",
    description: "Foundations of deep learning with live coding.",
    courseSlug: "machine-learning-a-z-hands-on",
    batchCode: null,
    status: "SCHEDULED",
    start: "2026-07-25T18:00:00",
    end: "2026-07-25T19:30:00",
    maxParticipants: 150,
    recording: true,
  },
  {
    roomCode: "sfc-fs-review",
    title: "Full-Stack Project Review",
    description: "Live review of learner capstone projects.",
    courseSlug: "full-stack-web-development-react-node",
    batchCode: "FS-JUL26",
    status: "SCHEDULED",
    start: "2026-07-22T20:00:00",
    end: "2026-07-22T21:30:00",
    maxParticipants: 60,
    recording: false,
  },
  {
    roomCode: "sfc-dm-work",
    title: "Digital Marketing Live Workshop",
    description: "Build a real campaign end-to-end, live.",
    courseSlug: "digital-marketing-masterclass-2026",
    batchCode: null,
    status: "SCHEDULED",
    start: "2026-08-01T18:30:00",
    end: "2026-08-01T20:00:00",
    maxParticipants: 200,
    recording: true,
  },
  {
    roomCode: "sfc-aws-kick",
    title: "AWS Practitioner — Kickoff Session",
    description: "Orientation and exam roadmap.",
    courseSlug: "aws-certified-cloud-practitioner",
    batchCode: "AWS-AUG26",
    status: "ENDED",
    start: "2026-07-10T19:00:00",
    end: "2026-07-10T20:30:00",
    maxParticipants: 80,
    recording: true,
    recordingUrl: "https://videos.pexels.com/video-files/3255275/3255275-uhd_2560_1440_25fps.mp4",
  },
  {
    roomCode: "sfc-orient",
    title: "New Learner Orientation Webinar",
    description: "How to get the most out of SkillForCareer.",
    courseSlug: null,
    batchCode: null,
    status: "ENDED",
    start: "2026-07-05T17:00:00",
    end: "2026-07-05T18:00:00",
    maxParticipants: 500,
    recording: true,
    recordingUrl: "https://videos.pexels.com/video-files/3252919/3252919-uhd_2560_1440_25fps.mp4",
  },
  {
    roomCode: "sfc-guest-pm",
    title: "Guest Lecture — Breaking into Product",
    description: "Fireside chat (postponed).",
    courseSlug: "product-management-fundamentals",
    batchCode: null,
    status: "CANCELLED",
    start: "2026-07-15T19:00:00",
    end: "2026-07-15T20:00:00",
    maxParticipants: 300,
    recording: false,
  },
];

const CODES = MEETINGS.map((m) => m.roomCode);

async function clean() {
  const res = await prisma.meeting.deleteMany({ where: { roomCode: { in: CODES } } });
  console.log(`Removed ${res.count} sample live class(es).`);
}

async function main() {
  if (process.argv.includes("--clean")) {
    await clean();
    return;
  }

  const host = await prisma.user.findFirst({
    where: { role: { slug: ROLES.SUPER_ADMIN } },
    select: { id: true, name: true },
  });
  if (!host) throw new Error("No SUPER_ADMIN user found — run `npm run db:seed` first.");

  let created = 0;
  for (const m of MEETINGS) {
    const exists = await prisma.meeting.findUnique({ where: { roomCode: m.roomCode }, select: { id: true } });
    if (exists) {
      console.log(`skip (exists): ${m.roomCode}`);
      continue;
    }
    const course = m.courseSlug
      ? await prisma.course.findUnique({ where: { slug: m.courseSlug }, select: { id: true } })
      : null;
    const batch = m.batchCode
      ? await prisma.batch.findUnique({ where: { code: m.batchCode }, select: { id: true } })
      : null;

    await prisma.meeting.create({
      data: {
        roomCode: m.roomCode,
        title: m.title,
        description: m.description,
        hostId: host.id,
        courseId: course?.id ?? null,
        batchId: batch?.id ?? null,
        status: m.status,
        provider: "webrtc",
        scheduledStart: new Date(m.start),
        scheduledEnd: m.end ? new Date(m.end) : null,
        actualStart: m.status === "LIVE" || m.status === "ENDED" ? new Date(m.start) : null,
        actualEnd: m.status === "ENDED" && m.end ? new Date(m.end) : null,
        maxParticipants: m.maxParticipants,
        isRecordingEnabled: m.recording,
        recordingUrl: m.recordingUrl ?? null,
      },
    });
    created += 1;
    console.log(`created: ${m.roomCode} (${m.status})`);
  }
  console.log(`\nDone. Created ${created}; host: ${host.name}.`);
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

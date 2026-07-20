import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../src/generated/prisma/client";
import { getMariaDbConfig } from "../src/lib/db-config";
import { ROLES } from "../src/config/roles";

/**
 * Seeds sample discussion threads (with replies) so /admin/discussions has
 * content. Idempotent: skips any thread whose title already exists.
 *
 * Run:    npx tsx --env-file=.env scripts/seed-discussions.ts
 * Clean:  npx tsx --env-file=.env scripts/seed-discussions.ts --clean
 */
const prisma = new PrismaClient({
  adapter: new PrismaMariaDb(
    getMariaDbConfig() as ConstructorParameters<typeof PrismaMariaDb>[0],
  ),
});

interface Seed {
  title: string;
  body: string;
  courseSlug: string | null;
  pinned: boolean;
  resolved: boolean;
  replies: string[];
}

const THREADS: Seed[] = [
  {
    title: "How do I handle missing values in a dataset?",
    body: "I have a CSV with lots of NaNs in numeric columns. Should I drop rows or impute? What's best practice?",
    courseSlug: "complete-data-science-bootcamp-python",
    pinned: false,
    resolved: false,
    replies: [
      "Depends on how much is missing. For <5% you can often drop; otherwise impute (mean/median for numeric).",
      "Also try sklearn's SimpleImputer or KNNImputer — covered in the Data Wrangling chapter.",
    ],
  },
  {
    title: "Confused about overfitting vs underfitting",
    body: "When my training accuracy is high but validation is low, is that overfitting or underfitting?",
    courseSlug: "machine-learning-a-z-hands-on",
    pinned: false,
    resolved: true,
    replies: ["That's overfitting — high variance. Try regularisation or more data. Marking this resolved 👍"],
  },
  {
    title: "Best resources for mastering React hooks?",
    body: "Beyond the course, any recommended reading for useEffect and custom hooks?",
    courseSlug: "full-stack-web-development-react-node",
    pinned: true,
    resolved: false,
    replies: ["The official React docs 'Escape Hatches' section is excellent. We also cover custom hooks in module 2."],
  },
  {
    title: "SEO vs SEM — which should I focus on first?",
    body: "For a brand-new brand with a small budget, where do I get more ROI early on?",
    courseSlug: "digital-marketing-masterclass-2026",
    pinned: false,
    resolved: false,
    replies: [],
  },
  {
    title: "Welcome & introductions 👋",
    body: "New here? Say hello and tell us what you want to learn. Pinned so everyone can see it!",
    courseSlug: null,
    pinned: true,
    resolved: false,
    replies: [
      "Hi everyone, excited to start the Data Science track!",
      "Welcome aboard — jump into the discussions whenever you're stuck.",
    ],
  },
];

const TITLES = THREADS.map((t) => t.title);

async function clean() {
  const threads = await prisma.discussion.findMany({
    where: { title: { in: TITLES }, parentId: null },
    select: { id: true },
  });
  const ids = threads.map((t) => t.id);
  if (ids.length) {
    await prisma.discussion.deleteMany({ where: { parentId: { in: ids } } });
    await prisma.discussion.deleteMany({ where: { id: { in: ids } } });
  }
  console.log(`Removed ${ids.length} sample thread(s) + replies.`);
}

async function main() {
  if (process.argv.includes("--clean")) {
    await clean();
    return;
  }

  const author = await prisma.user.findFirst({
    where: { role: { slug: ROLES.SUPER_ADMIN } },
    select: { id: true, name: true },
  });
  if (!author) throw new Error("No SUPER_ADMIN user found — run `npm run db:seed` first.");

  let created = 0;
  for (const t of THREADS) {
    const exists = await prisma.discussion.findFirst({
      where: { title: t.title, parentId: null },
      select: { id: true },
    });
    if (exists) {
      console.log(`skip (exists): ${t.title}`);
      continue;
    }
    let courseId: string | null = null;
    if (t.courseSlug) {
      const course = await prisma.course.findUnique({
        where: { slug: t.courseSlug },
        select: { id: true },
      });
      if (!course) {
        console.log(`skip (no course ${t.courseSlug}): ${t.title}`);
        continue;
      }
      courseId = course.id;
    }
    await prisma.discussion.create({
      data: {
        userId: author.id,
        courseId,
        title: t.title,
        body: t.body,
        isPinned: t.pinned,
        isResolved: t.resolved,
        replies: {
          create: t.replies.map((body) => ({ userId: author.id, courseId, body })),
        },
      },
    });
    created += 1;
    console.log(`created: ${t.title} (${t.replies.length} replies)`);
  }
  console.log(`\nDone. Created ${created}; author: ${author.name}.`);
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

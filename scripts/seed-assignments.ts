import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../src/generated/prisma/client";
import { getMariaDbConfig } from "../src/lib/db-config";
import { ROLES } from "../src/config/roles";

/**
 * Seeds sample assignments so /admin/assignments has content. Idempotent:
 * skips any assignment whose (title) already exists.
 *
 * Run:    npx tsx --env-file=.env scripts/seed-assignments.ts
 * Clean:  npx tsx --env-file=.env scripts/seed-assignments.ts --clean
 */
const prisma = new PrismaClient({
  adapter: new PrismaMariaDb(
    getMariaDbConfig() as ConstructorParameters<typeof PrismaMariaDb>[0],
  ),
});

interface Seed {
  title: string;
  description: string;
  instructions: string;
  courseSlug: string;
  maxScore: number;
  due: string | null;
  allowLate: boolean;
}

const ASSIGNMENTS: Seed[] = [
  {
    title: "EDA on a Real Dataset",
    description: "Explore, clean and visualise a real-world dataset with Pandas.",
    instructions:
      "Pick any dataset from Kaggle. Perform exploratory data analysis, handle missing values, and produce at least 5 visualisations. Submit a Jupyter notebook (.ipynb) and a short write-up of your findings.",
    courseSlug: "complete-data-science-bootcamp-python",
    maxScore: 100,
    due: "2026-08-05T23:59:00",
    allowLate: true,
  },
  {
    title: "Train & Evaluate a Classifier",
    description: "Build a supervised ML model and report its metrics.",
    instructions:
      "Train a classification model (logistic regression, random forest, or your choice). Report accuracy, precision, recall and a confusion matrix. Explain how you tuned it.",
    courseSlug: "machine-learning-a-z-hands-on",
    maxScore: 100,
    due: "2026-08-12T23:59:00",
    allowLate: false,
  },
  {
    title: "Build a REST API with Node & Express",
    description: "Create a CRUD REST API with authentication.",
    instructions:
      "Build an Express API with at least 4 endpoints, JWT auth, and input validation. Submit a GitHub repo link and a short README with setup steps.",
    courseSlug: "full-stack-web-development-react-node",
    maxScore: 100,
    due: "2026-07-28T23:59:00",
    allowLate: true,
  },
  {
    title: "Plan a 30-Day Marketing Campaign",
    description: "Design a multi-channel campaign for a brand of your choice.",
    instructions:
      "Create a 30-day content calendar covering SEO, social and email. Include target audience, KPIs and a sample ad. Submit a PDF.",
    courseSlug: "digital-marketing-masterclass-2026",
    maxScore: 50,
    due: "2026-07-10T23:59:00",
    allowLate: false,
  },
  {
    title: "Design a Product Roadmap",
    description: "Prioritise features and build a quarterly roadmap.",
    instructions:
      "Take a product you use daily. Write a problem statement, prioritise 5 features (RICE), and present a one-quarter roadmap. Submit slides or a doc.",
    courseSlug: "product-management-fundamentals",
    maxScore: 100,
    due: null,
    allowLate: false,
  },
  {
    title: "AWS Core Services Quiz Prep",
    description: "Summarise the core AWS services for the CLF-C02 exam.",
    instructions:
      "Create a one-page cheat sheet covering compute, storage, networking, security and pricing. Submit as a PDF.",
    courseSlug: "aws-certified-cloud-practitioner",
    maxScore: 20,
    due: "2026-08-18T23:59:00",
    allowLate: true,
  },
];

const TITLES = ASSIGNMENTS.map((a) => a.title);

async function clean() {
  const res = await prisma.assignment.deleteMany({ where: { title: { in: TITLES } } });
  console.log(`Removed ${res.count} sample assignment(s).`);
}

async function main() {
  if (process.argv.includes("--clean")) {
    await clean();
    return;
  }

  const creator = await prisma.user.findFirst({
    where: { role: { slug: ROLES.SUPER_ADMIN } },
    select: { id: true, name: true },
  });
  if (!creator) throw new Error("No SUPER_ADMIN user found — run `npm run db:seed` first.");

  let created = 0;
  for (const a of ASSIGNMENTS) {
    const exists = await prisma.assignment.findFirst({ where: { title: a.title }, select: { id: true } });
    if (exists) {
      console.log(`skip (exists): ${a.title}`);
      continue;
    }
    const course = await prisma.course.findUnique({
      where: { slug: a.courseSlug },
      select: { id: true },
    });
    if (!course) {
      console.log(`skip (no course ${a.courseSlug}): ${a.title}`);
      continue;
    }
    await prisma.assignment.create({
      data: {
        title: a.title,
        description: a.description,
        instructions: a.instructions,
        courseId: course.id,
        createdById: creator.id,
        maxScore: a.maxScore,
        dueDate: a.due ? new Date(a.due) : null,
        allowLate: a.allowLate,
      },
    });
    created += 1;
    console.log(`created: ${a.title}`);
  }
  console.log(`\nDone. Created ${created}; creator: ${creator.name}.`);
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

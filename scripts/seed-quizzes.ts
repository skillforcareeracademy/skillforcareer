import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../src/generated/prisma/client";
import { getMariaDbConfig } from "../src/lib/db-config";
import { ROLES } from "../src/config/roles";

/**
 * Seeds sample quizzes (with questions + options) so /admin/quizzes has content.
 * Idempotent: skips any quiz whose title already exists.
 *
 * Run:    npx tsx --env-file=.env scripts/seed-quizzes.ts
 * Clean:  npx tsx --env-file=.env scripts/seed-quizzes.ts --clean
 */
const prisma = new PrismaClient({
  adapter: new PrismaMariaDb(
    getMariaDbConfig() as ConstructorParameters<typeof PrismaMariaDb>[0],
  ),
});

type QType = "SINGLE_CHOICE" | "MULTIPLE_CHOICE" | "TRUE_FALSE" | "SHORT_ANSWER";
interface Q {
  type: QType;
  text: string;
  points: number;
  explanation?: string;
  options: { text: string; correct: boolean }[];
}
interface Seed {
  title: string;
  description: string;
  courseSlug: string;
  passingScore: number;
  timeLimit: number | null;
  published: boolean;
  questions: Q[];
}

const tf = (correct: "T" | "F"): Q["options"] => [
  { text: "True", correct: correct === "T" },
  { text: "False", correct: correct === "F" },
];

const QUIZZES: Seed[] = [
  {
    title: "Python Fundamentals Quiz",
    description: "Check your grasp of Python basics.",
    courseSlug: "complete-data-science-bootcamp-python",
    passingScore: 60,
    timeLimit: 15,
    published: true,
    questions: [
      {
        type: "SINGLE_CHOICE",
        text: "What is the output of type([])?",
        points: 1,
        explanation: "[] is a list literal.",
        options: [
          { text: "<class 'list'>", correct: true },
          { text: "<class 'dict'>", correct: false },
          { text: "<class 'tuple'>", correct: false },
          { text: "<class 'set'>", correct: false },
        ],
      },
      { type: "TRUE_FALSE", text: "Python is dynamically typed.", points: 1, options: tf("T") },
      {
        type: "MULTIPLE_CHOICE",
        text: "Which of these are mutable in Python?",
        points: 2,
        options: [
          { text: "list", correct: true },
          { text: "tuple", correct: false },
          { text: "dict", correct: true },
          { text: "str", correct: false },
        ],
      },
    ],
  },
  {
    title: "Machine Learning Basics",
    description: "Foundational ML concepts.",
    courseSlug: "machine-learning-a-z-hands-on",
    passingScore: 70,
    timeLimit: 20,
    published: true,
    questions: [
      {
        type: "SINGLE_CHOICE",
        text: "Which of these is a supervised learning task?",
        points: 1,
        options: [
          { text: "Linear regression", correct: true },
          { text: "K-means clustering", correct: false },
          { text: "PCA", correct: false },
          { text: "Association rules", correct: false },
        ],
      },
      { type: "TRUE_FALSE", text: "Overfitting is associated with high variance.", points: 1, options: tf("T") },
    ],
  },
  {
    title: "Full-Stack Web Dev Quiz",
    description: "HTTP, JavaScript and frameworks.",
    courseSlug: "full-stack-web-development-react-node",
    passingScore: 60,
    timeLimit: null,
    published: false,
    questions: [
      {
        type: "SINGLE_CHOICE",
        text: "Which HTTP method is idempotent?",
        points: 1,
        options: [
          { text: "GET", correct: true },
          { text: "POST", correct: false },
        ],
      },
      {
        type: "MULTIPLE_CHOICE",
        text: "Which of these are JavaScript front-end frameworks?",
        points: 2,
        options: [
          { text: "React", correct: true },
          { text: "Django", correct: false },
          { text: "Vue", correct: true },
          { text: "Flask", correct: false },
        ],
      },
    ],
  },
  {
    title: "AWS Cloud Practitioner Quick Check",
    description: "Core AWS services.",
    courseSlug: "aws-certified-cloud-practitioner",
    passingScore: 70,
    timeLimit: 10,
    published: true,
    questions: [
      {
        type: "SINGLE_CHOICE",
        text: "Which AWS service is primarily for compute?",
        points: 1,
        options: [
          { text: "Amazon EC2", correct: true },
          { text: "Amazon S3", correct: false },
          { text: "Amazon RDS", correct: false },
        ],
      },
      { type: "TRUE_FALSE", text: "S3 is an object storage service.", points: 1, options: tf("T") },
    ],
  },
];

const TITLES = QUIZZES.map((q) => q.title);

async function clean() {
  const res = await prisma.quiz.deleteMany({ where: { title: { in: TITLES } } });
  console.log(`Removed ${res.count} sample quiz(zes).`);
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
  for (const z of QUIZZES) {
    const exists = await prisma.quiz.findFirst({ where: { title: z.title }, select: { id: true } });
    if (exists) {
      console.log(`skip (exists): ${z.title}`);
      continue;
    }
    const course = await prisma.course.findUnique({
      where: { slug: z.courseSlug },
      select: { id: true },
    });
    if (!course) {
      console.log(`skip (no course ${z.courseSlug}): ${z.title}`);
      continue;
    }
    await prisma.quiz.create({
      data: {
        title: z.title,
        description: z.description,
        courseId: course.id,
        createdById: creator.id,
        passingScore: z.passingScore,
        timeLimitMinutes: z.timeLimit,
        isPublished: z.published,
        questions: {
          create: z.questions.map((q, qi) => ({
            type: q.type,
            text: q.text,
            points: q.points,
            explanation: q.explanation ?? null,
            order: qi,
            options: {
              create: q.options.map((o, oi) => ({ text: o.text, isCorrect: o.correct, order: oi })),
            },
          })),
        },
      },
    });
    created += 1;
    console.log(`created: ${z.title} (${z.questions.length} questions, ${z.published ? "published" : "draft"})`);
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

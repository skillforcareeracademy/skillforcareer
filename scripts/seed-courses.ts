import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient, Prisma } from "../src/generated/prisma/client";
import { getMariaDbConfig } from "../src/lib/db-config";
import { ROLES } from "../src/config/roles";

/**
 * Seeds a set of realistic sample courses (with curriculum) so the admin
 * catalog and public listing have content to show. Idempotent: skips any
 * course whose slug already exists, so it is safe to re-run.
 *
 * Run with:  npx tsx --env-file=.env scripts/seed-courses.ts
 * Remove all samples with:  npx tsx --env-file=.env scripts/seed-courses.ts --clean
 */
const prisma = new PrismaClient({
  adapter: new PrismaMariaDb(
    getMariaDbConfig() as ConstructorParameters<typeof PrismaMariaDb>[0],
  ),
});

function pexels(id: number, w = 800): string {
  const h = Math.round((w * 9) / 16);
  return `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=${w}&h=${h}&fit=crop&crop=faces`;
}

type Lvl = "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | "ALL_LEVELS";
type St = "DRAFT" | "PENDING_REVIEW" | "PUBLISHED" | "ARCHIVED";

interface Seed {
  slug: string;
  title: string;
  subtitle: string;
  categorySlug: string;
  level: Lvl;
  status: St;
  thumb: number;
  price: number;
  discount: number | null;
  free?: boolean;
  featured?: boolean;
  rating: number;
  ratingCount: number;
  enrollmentCount: number;
  tags: string[];
  objectives: string[];
  chapters: { title: string; lessons: string[] }[];
}

const c3 = (a: string, b: string, c: string, d: string): { title: string; lessons: string[] }[] => [
  { title: "Getting Started", lessons: ["Welcome & course overview", `Setting up your ${a}`, "How to get the most out of this course"] },
  { title: b, lessons: [`${b}: core concepts`, "Hands-on walkthrough", "Common pitfalls & best practices", "Practice exercise"] },
  { title: c, lessons: [`Deep dive into ${c}`, "Real-world example", "Mini project"] },
  { title: d, lessons: [`${d} in practice`, "Capstone project", "Next steps & resources"] },
];

const COURSES: Seed[] = [
  {
    slug: "complete-data-science-bootcamp-python",
    title: "Complete Data Science Bootcamp with Python",
    subtitle: "From Python & statistics to machine learning and deployment — build 10+ real projects.",
    categorySlug: "data-science", level: "ALL_LEVELS", status: "PUBLISHED", thumb: 19809475,
    price: 12999, discount: 8499, featured: true, rating: 4.8, ratingCount: 1243, enrollmentCount: 3280,
    tags: ["Python", "Pandas", "Machine Learning", "SQL"],
    objectives: ["Analyse data with Pandas & NumPy", "Build ML models with scikit-learn", "Deploy models to production"],
    chapters: c3("Python environment", "Data Wrangling", "Machine Learning", "Model Deployment"),
  },
  {
    slug: "machine-learning-a-z-hands-on",
    title: "Machine Learning A-Z: Hands-On Python",
    subtitle: "Master regression, classification, clustering and deep learning with practical code.",
    categorySlug: "ai-ml", level: "INTERMEDIATE", status: "PUBLISHED", thumb: 16323454,
    price: 14999, discount: 9999, featured: true, rating: 4.7, ratingCount: 986, enrollmentCount: 2140,
    tags: ["ML", "TensorFlow", "Neural Networks"],
    objectives: ["Understand supervised & unsupervised learning", "Build neural networks", "Evaluate & tune models"],
    chapters: c3("toolkit", "Supervised Learning", "Unsupervised Learning", "Deep Learning"),
  },
  {
    slug: "mba-essentials-strategy-leadership",
    title: "MBA Essentials: Business Strategy & Leadership",
    subtitle: "The frameworks top managers use — strategy, finance, marketing and leadership.",
    categorySlug: "management", level: "ALL_LEVELS", status: "PUBLISHED", thumb: 18067562,
    price: 19999, discount: 12999, rating: 4.6, ratingCount: 742, enrollmentCount: 1560,
    tags: ["Strategy", "Leadership", "Finance"],
    objectives: ["Think strategically about business", "Read financial statements", "Lead high-performing teams"],
    chapters: c3("workspace", "Business Strategy", "Financial Acumen", "Leadership"),
  },
  {
    slug: "full-stack-web-development-react-node",
    title: "Full-Stack Web Development with React & Node",
    subtitle: "Build and deploy production web apps with React, Node, Express and PostgreSQL.",
    categorySlug: "software-development", level: "BEGINNER", status: "PUBLISHED", thumb: 16323434,
    price: 11999, discount: 7499, featured: true, rating: 4.8, ratingCount: 1602, enrollmentCount: 4120,
    tags: ["React", "Node.js", "TypeScript", "REST"],
    objectives: ["Build responsive React UIs", "Design REST APIs with Node", "Deploy full-stack apps"],
    chapters: c3("dev environment", "Front-End with React", "Back-End with Node", "Deployment"),
  },
  {
    slug: "digital-marketing-masterclass-2026",
    title: "Digital Marketing Masterclass 2026",
    subtitle: "SEO, social media, Google Ads, email and analytics — grow any brand online.",
    categorySlug: "digital-marketing", level: "BEGINNER", status: "PUBLISHED", thumb: 26834970,
    price: 8999, discount: 4999, rating: 4.5, ratingCount: 531, enrollmentCount: 1980,
    tags: ["SEO", "Google Ads", "Social Media"],
    objectives: ["Rank websites on Google", "Run profitable ad campaigns", "Measure marketing ROI"],
    chapters: c3("accounts", "Search Marketing", "Social & Content", "Analytics & Growth"),
  },
  {
    slug: "product-management-fundamentals",
    title: "Product Management Fundamentals",
    subtitle: "Discover, build and launch products users love — the complete PM playbook.",
    categorySlug: "product-management", level: "INTERMEDIATE", status: "DRAFT", thumb: 18870185,
    price: 9999, discount: null, rating: 0, ratingCount: 0, enrollmentCount: 0,
    tags: ["Product", "Roadmaps", "Discovery"],
    objectives: ["Run product discovery", "Prioritise a roadmap", "Work with engineering & design"],
    chapters: c3("toolset", "Product Discovery", "Roadmapping", "Launch & Metrics"),
  },
  {
    slug: "aws-certified-cloud-practitioner",
    title: "AWS Certified Cloud Practitioner (2026)",
    subtitle: "Everything you need to pass the CLF-C02 exam and start your cloud career.",
    categorySlug: "cloud-devops", level: "BEGINNER", status: "PENDING_REVIEW", thumb: 16323454,
    price: 7999, discount: 5499, rating: 0, ratingCount: 0, enrollmentCount: 0,
    tags: ["AWS", "Cloud", "Certification"],
    objectives: ["Understand core AWS services", "Learn cloud pricing & security", "Pass the CLF-C02 exam"],
    chapters: c3("AWS account", "Core Services", "Security & Pricing", "Exam Preparation"),
  },
  {
    slug: "ui-ux-design-with-figma",
    title: "UI/UX Design with Figma — From Zero to Hero",
    subtitle: "Design beautiful, usable interfaces and build a portfolio that gets you hired.",
    categorySlug: "design", level: "ALL_LEVELS", status: "PUBLISHED", thumb: 19809475,
    price: 0, discount: null, free: true, rating: 4.9, ratingCount: 2201, enrollmentCount: 6740,
    tags: ["Figma", "UI", "UX", "Design Systems"],
    objectives: ["Master Figma end-to-end", "Apply UX principles", "Build a design portfolio"],
    chapters: c3("Figma file", "UX Foundations", "UI & Prototyping", "Portfolio"),
  },
];

// Free stock promo videos (Pexels CDN, hotlink-verified 206 OK), aligned by
// index to COURSES above.
const VIDEOS: string[] = [
  "https://videos.pexels.com/video-files/3255275/3255275-uhd_2560_1440_25fps.mp4",
  "https://videos.pexels.com/video-files/3130284/3130284-uhd_2560_1440_30fps.mp4",
  "https://videos.pexels.com/video-files/3252919/3252919-uhd_2560_1440_25fps.mp4",
  "https://videos.pexels.com/video-files/3141210/3141210-uhd_3840_2160_25fps.mp4",
  "https://videos.pexels.com/video-files/2887463/2887463-hd_1920_1080_25fps.mp4",
  "https://videos.pexels.com/video-files/3191572/3191572-uhd_2560_1440_25fps.mp4",
  "https://videos.pexels.com/video-files/3209211/3209211-uhd_2560_1440_25fps.mp4",
  "https://videos.pexels.com/video-files/3249935/3249935-uhd_3840_2160_25fps.mp4",
];

const SLUGS = COURSES.map((c) => c.slug);

async function clean() {
  const courses = await prisma.course.findMany({
    where: { slug: { in: SLUGS } },
    select: { id: true, chapters: { select: { id: true } } },
  });
  for (const course of courses) {
    const chapterIds = course.chapters.map((ch) => ch.id);
    if (chapterIds.length) {
      await prisma.lesson.deleteMany({ where: { chapterId: { in: chapterIds } } });
      await prisma.chapter.deleteMany({ where: { id: { in: chapterIds } } });
    }
    await prisma.course.delete({ where: { id: course.id } });
  }
  console.log(`Removed ${courses.length} sample course(s).`);
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

  const cats = await prisma.category.findMany({ select: { id: true, slug: true } });
  const catBySlug = new Map(cats.map((c) => [c.slug, c.id]));

  let created = 0;
  let updated = 0;
  for (let i = 0; i < COURSES.length; i++) {
    const c = COURSES[i];
    const promoVideoUrl = VIDEOS[i] ?? null;
    const existing = await prisma.course.findUnique({ where: { slug: c.slug }, select: { id: true } });
    if (existing) {
      // Already seeded — just make sure the promo video is set (keeps id/curriculum).
      await prisma.course.update({ where: { id: existing.id }, data: { promoVideoUrl } });
      updated += 1;
      console.log(`updated (promo video): ${c.slug}`);
      continue;
    }
    const categoryId = catBySlug.get(c.categorySlug);
    if (!categoryId) {
      console.log(`skip (no category ${c.categorySlug}): ${c.slug}`);
      continue;
    }

    const totalMinutes = c.chapters.reduce((sum, ch) => sum + ch.lessons.length * 8, 0);

    await prisma.course.create({
      data: {
        title: c.title,
        slug: c.slug,
        subtitle: c.subtitle,
        description: `<p>${c.subtitle}</p><p>This hands-on program is built for Indian learners and professionals looking to upskill fast with real projects and mentor support.</p>`,
        thumbnailUrl: pexels(c.thumb),
        promoVideoUrl,
        level: c.level,
        deliveryMode: "SELF_PACED",
        status: c.status,
        language: "en",
        pricingType: c.free ? "FREE" : "PAID",
        price: new Prisma.Decimal(c.free ? 0 : c.price),
        discountPrice: c.discount != null ? new Prisma.Decimal(c.discount) : null,
        currency: "INR",
        tags: c.tags,
        objectives: c.objectives,
        requirements: ["A computer with internet access", "No prior experience required"],
        durationMinutes: totalMinutes,
        isFeatured: Boolean(c.featured),
        ratingAvg: c.rating,
        ratingCount: c.ratingCount,
        enrollmentCount: c.enrollmentCount,
        categoryId,
        instructorId: instructor.id,
        publishedAt: c.status === "PUBLISHED" ? new Date() : null,
        chapters: {
          create: c.chapters.map((ch, i) => ({
            title: ch.title,
            order: i,
            lessons: {
              create: ch.lessons.map((title, j) => ({
                title,
                order: j,
                type: "VIDEO" as const,
                isPreview: i === 0 && j === 0,
                durationSeconds: 300 + ((i * 3 + j) % 6) * 120,
              })),
            },
          })),
        },
      },
    });
    created += 1;
    console.log(`created: ${c.slug} (${c.status})`);
  }
  console.log(`\nDone. Created ${created}, updated ${updated}; instructor: ${instructor.name}.`);
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

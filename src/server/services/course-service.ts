import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { AppError } from "@/lib/api/errors";
import type { CreateCourseInput, UpdateCourseInput } from "@/lib/validations/course";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 130);
}

function isUnique(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

async function uniqueSlug(base: string, excludeId?: string): Promise<string> {
  const root = base || "course";
  let n = 1;
  let slug = root;
  let clash = await prisma.course.findUnique({ where: { slug }, select: { id: true } });
  while (clash && clash.id !== excludeId) {
    n += 1;
    slug = `${root}-${n}`;
    clash = await prisma.course.findUnique({ where: { slug }, select: { id: true } });
  }
  return slug;
}

function toStringArray(json: Prisma.JsonValue | null): string[] {
  return Array.isArray(json) ? (json.filter((v) => typeof v === "string") as string[]) : [];
}

// ── Create / update / publish / delete ──────────────────────────────────────

export async function createCourse(
  input: CreateCourseInput,
  instructorId: string,
): Promise<string> {
  const slug = await uniqueSlug(slugify(input.title));
  const course = await prisma.course.create({
    data: {
      title: input.title,
      slug,
      categoryId: input.categoryId,
      instructorId,
      status: "DRAFT",
      pricingType: "PAID",
    },
    select: { id: true },
  });
  return course.id;
}

export async function updateCourse(
  id: string,
  input: UpdateCourseInput,
): Promise<void> {
  const data: Prisma.CourseUncheckedUpdateInput = {
    title: input.title,
    subtitle: input.subtitle || null,
    description: input.description || null,
    thumbnailUrl: input.thumbnailUrl || null,
    promoVideoUrl: input.promoVideoUrl || null,
    categoryId: input.categoryId,
    level: input.level,
    deliveryMode: input.deliveryMode,
    language: input.language,
    pricingType: input.pricingType,
    price: new Prisma.Decimal(input.pricingType === "FREE" ? 0 : input.price),
    discountPrice:
      input.discountPrice != null ? new Prisma.Decimal(input.discountPrice) : null,
    tags: input.tags ?? [],
    requirements: input.requirements ?? [],
    objectives: input.objectives ?? [],
  };
  if (input.slug) {
    data.slug = await uniqueSlug(slugify(input.slug), id);
  }
  try {
    await prisma.course.update({ where: { id }, data });
  } catch (e) {
    if (isUnique(e)) throw AppError.conflict("That slug is already in use.");
    throw e;
  }
}

export async function setCoursePublished(
  id: string,
  publish: boolean,
): Promise<void> {
  if (publish) {
    const lessons = await prisma.lesson.count({
      where: { chapter: { courseId: id } },
    });
    if (lessons === 0) {
      throw AppError.conflict("Add at least one lesson before publishing.");
    }
  }
  await prisma.course.update({
    where: { id },
    data: {
      status: publish ? "PUBLISHED" : "DRAFT",
      publishedAt: publish ? new Date() : null,
    },
  });
}

export async function deleteCourse(id: string): Promise<void> {
  const enrolled = await prisma.enrollment.count({ where: { courseId: id } });
  if (enrolled > 0) {
    throw AppError.conflict("This course has enrolments and can't be deleted.");
  }
  await prisma.course.delete({ where: { id } });
}

// ── Reads: editor ───────────────────────────────────────────────────────────

export async function getCourseForEdit(id: string) {
  const c = await prisma.course.findUnique({
    where: { id },
    include: {
      category: { select: { id: true, name: true } },
      chapters: {
        orderBy: { order: "asc" },
        include: {
          lessons: {
            orderBy: { order: "asc" },
            include: { video: true, attachments: true },
          },
        },
      },
    },
  });
  if (!c) return null;

  return {
    id: c.id,
    instructorId: c.instructorId,
    title: c.title,
    subtitle: c.subtitle,
    slug: c.slug,
    description: c.description,
    thumbnailUrl: c.thumbnailUrl,
    promoVideoUrl: c.promoVideoUrl,
    categoryId: c.categoryId,
    level: c.level,
    deliveryMode: c.deliveryMode,
    language: c.language,
    pricingType: c.pricingType,
    price: c.price.toNumber(),
    discountPrice: c.discountPrice ? c.discountPrice.toNumber() : null,
    status: c.status,
    tags: toStringArray(c.tags),
    requirements: toStringArray(c.requirements),
    objectives: toStringArray(c.objectives),
    chapters: c.chapters.map((ch) => ({
      id: ch.id,
      title: ch.title,
      description: ch.description,
      order: ch.order,
      lessons: ch.lessons.map((l) => ({
        id: l.id,
        title: l.title,
        type: l.type,
        order: l.order,
        isPreview: l.isPreview,
        durationSeconds: l.durationSeconds,
        content: l.content,
        videoUrl: l.video?.url ?? "",
        attachmentUrl: l.attachments[0]?.url ?? "",
      })),
    })),
  };
}

export type CourseEdit = NonNullable<Awaited<ReturnType<typeof getCourseForEdit>>>;

// ── Reads: admin list ────────────────────────────────────────────────────────

export interface CourseListQuery {
  page: number;
  pageSize: number;
  search?: string;
  status?: string;
  categoryId?: string;
  /** Scope to a single instructor's courses (for the instructor workspace). */
  instructorId?: string;
}

export async function listCoursesAdmin(q: CourseListQuery) {
  const and: Prisma.CourseWhereInput[] = [];
  if (q.search) and.push({ title: { contains: q.search } });
  if (q.status) and.push({ status: q.status as Prisma.CourseWhereInput["status"] });
  if (q.categoryId) and.push({ categoryId: q.categoryId });
  if (q.instructorId) and.push({ instructorId: q.instructorId });
  const where: Prisma.CourseWhereInput = and.length ? { AND: and } : {};

  const [total, rows] = await Promise.all([
    prisma.course.count({ where }),
    prisma.course.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      include: {
        category: { select: { name: true } },
        instructor: { select: { name: true } },
        _count: { select: { enrollments: true, chapters: true } },
      },
    }),
  ]);

  return {
    total,
    courses: rows.map((c) => ({
      id: c.id,
      title: c.title,
      slug: c.slug,
      subtitle: c.subtitle,
      status: c.status,
      level: c.level,
      thumbnailUrl: c.thumbnailUrl,
      categoryName: c.category.name,
      instructorName: c.instructor.name,
      price: c.price.toNumber(),
      discountPrice: c.discountPrice ? c.discountPrice.toNumber() : null,
      pricingType: c.pricingType,
      enrollments: c._count.enrollments,
      chapters: c._count.chapters,
      updatedAt: c.updatedAt.toISOString(),
    })),
  };
}

export interface CourseStats {
  total: number;
  published: number;
  draft: number;
  pendingReview: number;
  enrollments: number;
}

/** Course counters for the header. Pass `instructorId` to scope to one teacher. */
export async function courseStats(instructorId?: string): Promise<CourseStats> {
  const scope: Prisma.CourseWhereInput = instructorId ? { instructorId } : {};
  const enrollmentScope: Prisma.EnrollmentWhereInput = instructorId
    ? { course: { instructorId } }
    : {};
  const [total, published, draft, pendingReview, enrollments] = await Promise.all([
    prisma.course.count({ where: scope }),
    prisma.course.count({ where: { ...scope, status: "PUBLISHED" } }),
    prisma.course.count({ where: { ...scope, status: "DRAFT" } }),
    prisma.course.count({ where: { ...scope, status: "PENDING_REVIEW" } }),
    prisma.enrollment.count({ where: enrollmentScope }),
  ]);
  return { total, published, draft, pendingReview, enrollments };
}

// ── Reads: public catalog + detail ───────────────────────────────────────────

export async function listPublicCourses(opts: {
  categorySlug?: string;
  search?: string;
  take?: number;
}) {
  const and: Prisma.CourseWhereInput[] = [{ status: "PUBLISHED" }];
  if (opts.categorySlug) and.push({ category: { slug: opts.categorySlug } });
  if (opts.search) and.push({ title: { contains: opts.search } });

  const rows = await prisma.course.findMany({
    where: { AND: and },
    orderBy: [{ isFeatured: "desc" }, { enrollmentCount: "desc" }, { publishedAt: "desc" }],
    take: opts.take ?? 24,
    include: {
      category: { select: { name: true, slug: true } },
      instructor: { select: { name: true } },
      _count: { select: { chapters: true, enrollments: true } },
    },
  });

  return rows.map((c) => ({
    id: c.id,
    title: c.title,
    slug: c.slug,
    subtitle: c.subtitle,
    thumbnailUrl: c.thumbnailUrl,
    level: c.level,
    categoryName: c.category.name,
    categorySlug: c.category.slug,
    instructorName: c.instructor.name,
    price: c.price.toNumber(),
    discountPrice: c.discountPrice ? c.discountPrice.toNumber() : null,
    pricingType: c.pricingType,
    ratingAvg: c.ratingAvg,
    ratingCount: c.ratingCount,
    enrollments: c._count.enrollments,
    chapters: c._count.chapters,
  }));
}

/**
 * Type-ahead suggestions for the site search boxes. Deliberately narrow: only
 * the fields a dropdown row draws, so the query stays a single indexed scan
 * plus one batched category lookup — this runs on every keystroke (debounced).
 */
export type CourseSuggestion = {
  id: string;
  title: string;
  slug: string;
  thumbnailUrl: string | null;
  categoryName: string;
  level: string;
  price: number;
  discountPrice: number | null;
  pricingType: string;
};

const SUGGESTION_SELECT = {
  id: true,
  title: true,
  slug: true,
  thumbnailUrl: true,
  level: true,
  price: true,
  discountPrice: true,
  pricingType: true,
  category: { select: { name: true } },
} satisfies Prisma.CourseSelect;

type SuggestionRow = Prisma.CourseGetPayload<{ select: typeof SUGGESTION_SELECT }>;

function toSuggestion(c: SuggestionRow): CourseSuggestion {
  return {
    id: c.id,
    title: c.title,
    slug: c.slug,
    thumbnailUrl: c.thumbnailUrl,
    categoryName: c.category.name,
    level: c.level,
    price: c.price.toNumber(),
    discountPrice: c.discountPrice ? c.discountPrice.toNumber() : null,
    pricingType: c.pricingType,
  };
}

export async function searchPublicCourses(
  query: string,
  take = 6,
): Promise<CourseSuggestion[]> {
  const q = query.trim();
  if (!q) return [];

  const rows = await prisma.course.findMany({
    where: {
      status: "PUBLISHED",
      OR: [{ title: { contains: q } }, { subtitle: { contains: q } }],
    },
    orderBy: [{ isFeatured: "desc" }, { enrollmentCount: "desc" }],
    take,
    select: SUGGESTION_SELECT,
  });
  return rows.map(toSuggestion);
}

/** A homepage "Trending programs" card, straight from the catalogue. */
export type TrendingProgram = {
  id: string;
  title: string;
  slug: string;
  thumbnailUrl: string | null;
  level: string;
  categoryName: string;
  categorySlug: string;
  instructorName: string;
  price: number;
  discountPrice: number | null;
  pricingType: string;
  ratingAvg: number;
  ratingCount: number;
  enrollments: number;
  durationMinutes: number;
  isFeatured: boolean;
  /** First three learning objectives — the card's bullet list. */
  highlights: string[];
};

export async function listTrendingPrograms(take = 6): Promise<TrendingProgram[]> {
  const rows = await prisma.course.findMany({
    where: { status: "PUBLISHED" },
    orderBy: [{ isFeatured: "desc" }, { enrollmentCount: "desc" }, { publishedAt: "desc" }],
    take,
    select: {
      id: true,
      title: true,
      slug: true,
      thumbnailUrl: true,
      level: true,
      price: true,
      discountPrice: true,
      pricingType: true,
      ratingAvg: true,
      ratingCount: true,
      enrollmentCount: true,
      durationMinutes: true,
      isFeatured: true,
      objectives: true,
      category: { select: { name: true, slug: true } },
      instructor: { select: { name: true } },
    },
  });

  return rows.map((c) => ({
    id: c.id,
    title: c.title,
    slug: c.slug,
    thumbnailUrl: c.thumbnailUrl,
    level: c.level,
    categoryName: c.category.name,
    categorySlug: c.category.slug,
    instructorName: c.instructor.name,
    price: c.price.toNumber(),
    discountPrice: c.discountPrice ? c.discountPrice.toNumber() : null,
    pricingType: c.pricingType,
    ratingAvg: c.ratingAvg,
    ratingCount: c.ratingCount,
    enrollments: c.enrollmentCount,
    durationMinutes: c.durationMinutes,
    isFeatured: c.isFeatured,
    highlights: toStringArray(c.objectives).slice(0, 3),
  }));
}

/** The courses behind the "Popular:" chips under the hero search box. */
export async function listPopularCourses(take = 6): Promise<CourseSuggestion[]> {
  const rows = await prisma.course.findMany({
    where: { status: "PUBLISHED" },
    orderBy: [{ enrollmentCount: "desc" }, { ratingAvg: "desc" }],
    take,
    select: SUGGESTION_SELECT,
  });
  return rows.map(toSuggestion);
}

export async function getPublicCourseBySlug(slug: string) {
  const c = await prisma.course.findFirst({
    where: { slug, status: "PUBLISHED" },
    include: {
      category: { select: { name: true, slug: true } },
      instructor: { select: { name: true, headline: true, avatarUrl: true } },
      chapters: {
        orderBy: { order: "asc" },
        include: {
          lessons: {
            orderBy: { order: "asc" },
            select: { id: true, title: true, type: true, durationSeconds: true, isPreview: true },
          },
        },
      },
      _count: { select: { enrollments: true, reviews: true } },
    },
  });
  if (!c) return null;

  const lessonCount = c.chapters.reduce((sum, ch) => sum + ch.lessons.length, 0);
  return {
    id: c.id,
    title: c.title,
    subtitle: c.subtitle,
    slug: c.slug,
    description: c.description,
    thumbnailUrl: c.thumbnailUrl,
    promoVideoUrl: c.promoVideoUrl,
    level: c.level,
    deliveryMode: c.deliveryMode,
    language: c.language,
    price: c.price.toNumber(),
    discountPrice: c.discountPrice ? c.discountPrice.toNumber() : null,
    pricingType: c.pricingType,
    ratingAvg: c.ratingAvg,
    ratingCount: c.ratingCount,
    tags: toStringArray(c.tags),
    requirements: toStringArray(c.requirements),
    objectives: toStringArray(c.objectives),
    category: c.category,
    instructor: c.instructor,
    enrollments: c._count.enrollments,
    lessonCount,
    chapters: c.chapters.map((ch) => ({
      id: ch.id,
      title: ch.title,
      description: ch.description,
      lessons: ch.lessons,
    })),
  };
}

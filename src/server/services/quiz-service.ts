import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { AppError } from "@/lib/api/errors";
import type {
  CreateQuizInput,
  UpdateQuizInput,
  QuestionInput,
  ImportQuestionsInput,
} from "@/lib/validations/quiz";

/** Filter value for "quizzes nobody has grouped yet". */
export const NO_CATEGORY = "none";

// ── Reads ────────────────────────────────────────────────────────────────────

export interface QuizListQuery {
  page: number;
  pageSize: number;
  search?: string;
  courseId?: string;
  /** Only quizzes set for this cohort. */
  batchId?: string;
  status?: string; // PUBLISHED | DRAFT
  /** Grouping filters — a category, and one of its sub-categories. */
  categoryId?: string;
  subCategoryId?: string;
  /** Scope to quizzes an instructor created or owns via the course. */
  ownerId?: string;
  /** "sequence" (the academy's own order) or "recent". */
  sort?: string;
}

export async function listQuizzesAdmin(q: QuizListQuery) {
  const and: Prisma.QuizWhereInput[] = [];
  if (q.search) and.push({ title: { contains: q.search } });
  if (q.courseId) and.push({ courseId: q.courseId });
  if (q.batchId) and.push({ batches: { some: { batchId: q.batchId } } });
  if (q.status === "PUBLISHED") and.push({ isPublished: true });
  if (q.status === "DRAFT") and.push({ isPublished: false });
  if (q.categoryId === NO_CATEGORY) and.push({ categoryId: null });
  else if (q.categoryId) and.push({ categoryId: q.categoryId });
  if (q.subCategoryId) and.push({ subCategoryId: q.subCategoryId });
  if (q.ownerId) {
    and.push({ OR: [{ createdById: q.ownerId }, { course: { instructorId: q.ownerId } }] });
  }
  const where: Prisma.QuizWhereInput = and.length ? { AND: and } : {};

  // The academy's own order by default — "Quiz 1, Quiz 2, Quiz 3" is what the
  // sequence is for, and sorting by whoever edited last undoes it.
  const orderBy: Prisma.QuizOrderByWithRelationInput[] =
    q.sort === "recent"
      ? [{ updatedAt: "desc" }]
      : [{ sequence: "asc" }, { createdAt: "asc" }];

  const [total, rows] = await Promise.all([
    prisma.quiz.count({ where }),
    prisma.quiz.findMany({
      where,
      orderBy,
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      include: {
        course: { select: { title: true } },
        createdBy: { select: { name: true } },
        category: { select: { id: true, name: true } },
        subCategory: { select: { id: true, name: true } },
        _count: { select: { questions: true, attempts: true } },
        batches: { select: { batch: { select: { id: true, name: true } } } },
      },
    }),
  ]);

  return {
    total,
    quizzes: rows.map((z) => ({
      id: z.id,
      title: z.title,
      sequence: z.sequence,
      courseId: z.courseId,
      courseTitle: z.course?.title ?? null,
      categoryId: z.categoryId,
      categoryName: z.category?.name ?? null,
      subCategoryId: z.subCategoryId,
      subCategoryName: z.subCategory?.name ?? null,
      batchIds: z.batches.map((b) => b.batch.id),
      batchNames: z.batches.map((b) => b.batch.name),
      createdByName: z.createdBy.name,
      passingScore: z.passingScore,
      timeLimitMinutes: z.timeLimitMinutes,
      isPublished: z.isPublished,
      questions: z._count.questions,
      attempts: z._count.attempts,
    })),
  };
}

export interface QuizStats {
  total: number;
  published: number;
  draft: number;
  attempts: number;
}

export async function quizStats(ownerId?: string): Promise<QuizStats> {
  const scope: Prisma.QuizWhereInput = ownerId
    ? { OR: [{ createdById: ownerId }, { course: { instructorId: ownerId } }] }
    : {};
  const attemptScope: Prisma.QuizAttemptWhereInput = ownerId
    ? { quiz: { OR: [{ createdById: ownerId }, { course: { instructorId: ownerId } }] } }
    : {};
  const [total, published, attempts] = await Promise.all([
    prisma.quiz.count({ where: scope }),
    prisma.quiz.count({ where: { ...scope, isPublished: true } }),
    prisma.quizAttempt.count({ where: attemptScope }),
  ]);
  return { total, published, draft: total - published, attempts };
}

export async function getQuizEdit(id: string) {
  const z = await prisma.quiz.findUnique({
    where: { id },
    include: {
      questions: {
        orderBy: { order: "asc" },
        include: { options: { orderBy: { order: "asc" } } },
      },
      batches: { select: { batch: { select: { id: true, name: true } } } },
      students: { select: { userId: true } },
      sources: {
        orderBy: { createdAt: "asc" },
        include: {
          batchNote: { select: { title: true, batch: { select: { name: true } } } },
          lesson: { select: { title: true } },
        },
      },
    },
  });
  if (!z) throw AppError.notFound("Quiz not found.");

  return {
    id: z.id,
    title: z.title,
    description: z.description,
    courseId: z.courseId,
    timeLimitMinutes: z.timeLimitMinutes,
    passingScore: z.passingScore,
    gradingMode: z.gradingMode,
    maxAttempts: z.maxAttempts,
    shuffleQuestions: z.shuffleQuestions,
    showAnswers: z.showAnswers,
    showAnswerPerQuestion: z.showAnswerPerQuestion,
    categoryId: z.categoryId,
    subCategoryId: z.subCategoryId,
    sequence: z.sequence,
    isPublished: z.isPublished,
    // datetime-local wants local wall clock without the zone or seconds.
    releaseAt: z.releaseAt ? toLocalInput(z.releaseAt) : "",
    batchIds: z.batches.map((b) => b.batch.id),
    batches: z.batches.map((b) => b.batch),
    studentIds: z.students.map((s) => s.userId),
    sources: z.sources.map((src) => ({
      id: src.id,
      title: src.title,
      kind: src.batchNoteId ? ("BATCH_NOTE" as const) : src.lessonId ? ("LESSON" as const) : ("TEXT" as const),
      where: src.batchNote?.batch.name ?? null,
      hasText: Boolean(src.text?.trim()),
    })),
    questions: z.questions.map((q) => ({
      id: q.id,
      type: q.type,
      text: q.text,
      points: q.points,
      correctAnswer: q.correctAnswer,
      explanation: q.explanation,
      options: q.options.map((o) => ({ id: o.id, text: o.text, isCorrect: o.isCorrect })),
    })),
    totalPoints: z.questions.reduce((sum, q) => sum + q.points, 0),
  };
}

export async function listCoursesForSelect(instructorId?: string) {
  return prisma.course.findMany({
    where: instructorId ? { instructorId } : {},
    select: { id: true, title: true },
    orderBy: { title: "asc" },
  });
}

// ── Quiz writes ──────────────────────────────────────────────────────────────

export async function createQuiz(input: CreateQuizInput, createdById: string): Promise<string> {
  const categoryId = input.categoryId || null;
  const subCategoryId = input.subCategoryId || null;
  const z = await prisma.quiz.create({
    data: {
      title: input.title,
      courseId: input.courseId || null,
      categoryId,
      subCategoryId,
      // Numbered as it is created, so a new paper lands at the end of its group
      // rather than at "0" among everything else.
      sequence: await nextSequence(categoryId, subCategoryId),
      createdById,
    },
    select: { id: true },
  });
  return z.id;
}

/**
 * The next number in a group. The group is the narrowest one a quiz belongs to
 * — its sub-category if it has one, else its category, else "ungrouped" — which
 * is what makes the numbers read as "ICD-10 quiz 1, 2, 3" rather than as one
 * long list across the whole academy.
 */
async function nextSequence(categoryId: string | null, subCategoryId: string | null): Promise<number> {
  const last = await prisma.quiz.findFirst({
    where: groupWhere(categoryId, subCategoryId),
    orderBy: { sequence: "desc" },
    select: { sequence: true },
  });
  return (last?.sequence ?? 0) + 1;
}

function groupWhere(categoryId: string | null, subCategoryId: string | null): Prisma.QuizWhereInput {
  if (subCategoryId) return { subCategoryId };
  if (categoryId) return { categoryId, subCategoryId: null };
  return { categoryId: null, subCategoryId: null };
}

export async function updateQuiz(id: string, input: UpdateQuizInput): Promise<void> {
  const existing = await prisma.quiz.findUnique({
    where: { id },
    select: { id: true, categoryId: true, subCategoryId: true, sequence: true },
  });
  if (!existing) throw AppError.notFound("Quiz not found.");

  const categoryId = input.categoryId || null;
  // A sub-category only means anything under its own category.
  const subCategoryId = categoryId ? input.subCategoryId || null : null;
  const moved = categoryId !== existing.categoryId || subCategoryId !== existing.subCategoryId;

  await prisma.quiz.update({
    where: { id },
    data: {
      title: input.title,
      description: input.description || null,
      courseId: input.courseId || null,
      categoryId,
      subCategoryId,
      // Moved to another group, it takes the next free number there — two
      // quizzes numbered 3 in the same group would make the order arbitrary.
      ...(moved ? { sequence: await nextSequence(categoryId, subCategoryId) } : {}),
      timeLimitMinutes: input.timeLimitMinutes ?? null,
      passingScore: input.passingScore,
      gradingMode: input.gradingMode,
      maxAttempts: input.maxAttempts,
      shuffleQuestions: input.shuffleQuestions,
      showAnswers: input.showAnswers,
      showAnswerPerQuestion: input.showAnswerPerQuestion,
      releaseAt: input.releaseAt ? new Date(input.releaseAt) : null,
    },
  });
  await setQuizAudience(id, input.batchIds, input.studentIds);
}

/**
 * Renumber a group 1…n in the order the admin dragged it into.
 *
 * One statement, not one per quiz: `prisma.quiz.updateMany` throws "Expected
 * zero or one element" as soon as it matches more than one row under
 * `relationMode = "prisma"` (Quiz owns a one-to-one relation to Lesson), and a
 * round trip per row to a database a region away is no way to reorder fifty
 * papers. Ids are checked against the table first and bound as parameters.
 */
export async function reorderQuizzes(ids: string[], ownerId?: string): Promise<number> {
  const scope: Prisma.QuizWhereInput = ownerId
    ? { OR: [{ createdById: ownerId }, { course: { instructorId: ownerId } }] }
    : {};
  const rows = await prisma.quiz.findMany({
    where: { AND: [{ id: { in: ids } }, scope] },
    select: { id: true },
  });
  const allowed = new Set(rows.map((r) => r.id));
  const ordered = ids.filter((id) => allowed.has(id));
  if (ordered.length === 0) throw AppError.badRequest("Nothing to reorder.");

  const cases = ordered.map((id, i) => Prisma.sql`WHEN ${id} THEN ${i + 1}`);
  await prisma.$executeRaw`
    UPDATE \`Quiz\`
    SET \`sequence\` = CASE id ${Prisma.join(cases, " ")} END,
        updatedAt = ${new Date()}
    WHERE id IN (${Prisma.join(ordered.map((id) => Prisma.sql`${id}`))})
  `;
  return ordered.length;
}

/**
 * Number anything still sitting at 0 — quizzes made before grouping existed,
 * and any row a failed reorder left behind. Runs on the quizzes page, so the
 * numbers an admin sees are always the numbers in the table.
 */
export async function backfillQuizSequences(): Promise<number> {
  const rows = await prisma.quiz.findMany({
    where: { sequence: { lte: 0 } },
    orderBy: { createdAt: "asc" },
    select: { id: true, categoryId: true, subCategoryId: true },
  });
  if (rows.length === 0) return 0;

  // Where each group has got to, so a backfill lands after the numbered ones.
  const highest = new Map<string, number>();
  const keyOf = (r: { categoryId: string | null; subCategoryId: string | null }) =>
    r.subCategoryId ?? r.categoryId ?? "";
  for (const key of new Set(rows.map(keyOf))) {
    const [categoryId, subCategoryId] = ((): [string | null, string | null] => {
      const row = rows.find((r) => keyOf(r) === key)!;
      return [row.categoryId, row.subCategoryId];
    })();
    const last = await prisma.quiz.findFirst({
      where: groupWhere(categoryId, subCategoryId),
      orderBy: { sequence: "desc" },
      select: { sequence: true },
    });
    highest.set(key, Math.max(0, last?.sequence ?? 0));
  }

  const cases = rows.map((r) => {
    const key = keyOf(r);
    const next = (highest.get(key) ?? 0) + 1;
    highest.set(key, next);
    return Prisma.sql`WHEN ${r.id} THEN ${next}`;
  });
  await prisma.$executeRaw`
    UPDATE \`Quiz\`
    SET \`sequence\` = CASE id ${Prisma.join(cases, " ")} END
    WHERE id IN (${Prisma.join(rows.map((r) => Prisma.sql`${r.id}`))})
  `;
  return rows.length;
}

/** `2026-09-30T14:05:00Z` → `2026-09-30T19:35` in the server's zone. */
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Replace the cohorts and individuals a quiz is set for. Deleted and re-created
 * rather than diffed — a handful of rows, and two statements beat a per-row
 * reconciliation against a database a region away. The mirror of
 * `assignment-service.setAudience`.
 */
async function setQuizAudience(
  quizId: string,
  batchIds: string[] | undefined,
  studentIds: string[] | undefined,
): Promise<void> {
  const batches = [...new Set(batchIds ?? [])];
  const students = [...new Set(studentIds ?? [])];
  await prisma.$transaction([
    prisma.quizBatch.deleteMany({ where: { quizId } }),
    prisma.quizStudent.deleteMany({ where: { quizId } }),
    ...(batches.length
      ? [prisma.quizBatch.createMany({ data: batches.map((batchId) => ({ quizId, batchId })) })]
      : []),
    ...(students.length
      ? [prisma.quizStudent.createMany({ data: students.map((userId) => ({ quizId, userId })) })]
      : []),
  ]);
}

/** Cohorts to offer when setting a quiz (all, or one course's). */
export async function listBatchesForSelect(courseId?: string, instructorId?: string) {
  const rows = await prisma.batch.findMany({
    where: {
      ...(courseId ? { courseId } : {}),
      ...(instructorId ? { course: { instructorId } } : {}),
    },
    select: { id: true, name: true, courseId: true, course: { select: { title: true } } },
    orderBy: [{ startDate: "desc" }, { name: "asc" }],
    take: 300,
  });
  return rows.map((b) => ({
    id: b.id,
    name: b.name,
    courseId: b.courseId,
    courseTitle: b.course.title,
  }));
}

export async function deleteQuiz(id: string): Promise<void> {
  const existing = await prisma.quiz.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw AppError.notFound("Quiz not found.");
  await prisma.quiz.delete({ where: { id } });
}

export async function publishQuiz(id: string, publish: boolean): Promise<void> {
  const z = await prisma.quiz.findUnique({
    where: { id },
    select: { _count: { select: { questions: true } } },
  });
  if (!z) throw AppError.notFound("Quiz not found.");
  if (publish && z._count.questions === 0) {
    throw AppError.badRequest("Add at least one question before publishing.");
  }
  await prisma.quiz.update({ where: { id }, data: { isPublished: publish } });
}

// ── Question writes ──────────────────────────────────────────────────────────

function optionData(input: QuestionInput) {
  if (input.type === "SHORT_ANSWER") return [];
  return input.options.map((o, i) => ({ text: o.text, isCorrect: o.isCorrect, order: i }));
}

export async function createQuestion(quizId: string, input: QuestionInput): Promise<string> {
  const quiz = await prisma.quiz.findUnique({ where: { id: quizId }, select: { id: true } });
  if (!quiz) throw AppError.notFound("Quiz not found.");
  const last = await prisma.question.findFirst({
    where: { quizId },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  const q = await prisma.question.create({
    data: {
      quizId,
      type: input.type,
      text: input.text,
      points: input.points,
      correctAnswer: input.correctAnswer || null,
      explanation: input.explanation || null,
      order: (last?.order ?? -1) + 1,
      options: { create: optionData(input) },
    },
    select: { id: true },
  });
  return q.id;
}

export async function updateQuestion(id: string, input: QuestionInput): Promise<void> {
  const existing = await prisma.question.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw AppError.notFound("Question not found.");
  // Replace options wholesale (simplest correct approach).
  await prisma.questionOption.deleteMany({ where: { questionId: id } });
  await prisma.question.update({
    where: { id },
    data: {
      type: input.type,
      text: input.text,
      points: input.points,
      correctAnswer: input.correctAnswer || null,
      explanation: input.explanation || null,
      options: { create: optionData(input) },
    },
  });
}

export async function deleteQuestion(id: string): Promise<void> {
  const existing = await prisma.question.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw AppError.notFound("Question not found.");
  await prisma.question.delete({ where: { id } });
}

export async function reorderQuestions(quizId: string, ids: string[]): Promise<void> {
  await prisma.$transaction(
    ids.map((id, index) =>
      prisma.question.updateMany({ where: { id, quizId }, data: { order: index } }),
    ),
  );
}

/** The quiz a question belongs to, or null if the question doesn't exist. */
export async function quizIdForQuestion(questionId: string): Promise<string | null> {
  const question = await prisma.question.findUnique({
    where: { id: questionId },
    select: { quizId: true },
  });
  return question?.quizId ?? null;
}

// ── Question bank import / export ────────────────────────────────────────────

/** The question bank in the shape `importQuestions` reads back. */
export async function exportQuestions(quizId: string) {
  const rows = await prisma.question.findMany({
    where: { quizId },
    orderBy: { order: "asc" },
    include: { options: { orderBy: { order: "asc" } } },
  });
  return {
    questions: rows.map((q) => ({
      type: q.type,
      text: q.text,
      points: q.points,
      correctAnswer: q.correctAnswer ?? "",
      explanation: q.explanation ?? "",
      options: q.options.map((o) => ({ text: o.text, isCorrect: o.isCorrect })),
    })),
  };
}

export async function importQuestions(
  quizId: string,
  input: ImportQuestionsInput,
): Promise<number> {
  const quiz = await prisma.quiz.findUnique({ where: { id: quizId }, select: { id: true } });
  if (!quiz) throw AppError.notFound("Quiz not found.");

  if (input.replace) {
    await prisma.question.deleteMany({ where: { quizId } });
  }
  const last = input.replace
    ? null
    : await prisma.question.findFirst({
        where: { quizId },
        orderBy: { order: "desc" },
        select: { order: true },
      });

  let order = (last?.order ?? -1) + 1;
  // Sequential rather than one createMany: each question owns its options, and
  // a nested create is the only way to write both in a single statement.
  for (const q of input.questions) {
    await prisma.question.create({
      data: {
        quizId,
        type: q.type,
        text: q.text,
        points: q.points,
        order: order++,
        correctAnswer: q.correctAnswer || null,
        explanation: q.explanation || null,
        options: { create: optionData(q) },
      },
    });
  }
  return input.questions.length;
}

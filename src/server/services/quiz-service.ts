import { prisma } from "@/lib/prisma";
import { moveToTrash } from "./trash-service";
import { Prisma } from "@/generated/prisma/client";
import { AppError } from "@/lib/api/errors";
import { toCsv, parseCsv } from "@/lib/csv";
import {
  groupOptions,
  groupsOfMany,
  itemsInGroups,
  setGroupsFor,
} from "./content-group-service";
import {
  QUIZ_EXPORT_COLUMNS,
  DEFAULT_QUIZ_COLUMNS,
  QUIZ_DIFFICULTIES,
  type QuizExportColumn,
  type CreateQuizInput,
  type UpdateQuizInput,
  type QuestionInput,
  type ImportQuestionsInput,
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
  /** How hard the paper is. */
  difficulty?: string;
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
  if (q.difficulty) and.push({ difficulty: q.difficulty as Prisma.QuizWhereInput["difficulty"] });
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

  // The folders each paper is filed in, from the shared group system — one read
  // for the page, then the paths the folder view groups on.
  const [membership, options] = await Promise.all([
    groupsOfMany("QUIZ", rows.map((r) => r.id)),
    groupOptions("QUIZ"),
  ]);
  const pathOf = new Map(options.map((o) => [o.id, o.path]));

  return {
    total,
    quizzes: rows.map((z) => ({
      id: z.id,
      title: z.title,
      quizNo: z.quizNo,
      sequence: z.sequence,
      difficulty: z.difficulty,
      courseId: z.courseId,
      courseTitle: z.course?.title ?? null,
      categoryId: z.categoryId,
      categoryName: z.category?.name ?? null,
      subCategoryId: z.subCategoryId,
      subCategoryName: z.subCategory?.name ?? null,
      groupIds: membership.get(z.id) ?? [],
      groupPaths: (membership.get(z.id) ?? [])
        .map((g) => pathOf.get(g) ?? "")
        .filter(Boolean),
      batchIds: z.batches.map((b) => b.batch.id),
      batchNames: z.batches.map((b) => b.batch.name),
      createdByName: z.createdBy.name,
      passingScore: z.passingScore,
      timeLimitMinutes: z.timeLimitMinutes,
      perQuestionSeconds: z.perQuestionSeconds,
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
          studyMaterial: { select: { title: true, course: { select: { title: true } } } },
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
    perQuestionSeconds: z.perQuestionSeconds,
    passingScore: z.passingScore,
    gradingMode: z.gradingMode,
    maxAttempts: z.maxAttempts,
    shuffleQuestions: z.shuffleQuestions,
    showAnswers: z.showAnswers,
    showAnswerPerQuestion: z.showAnswerPerQuestion,
    categoryId: z.categoryId,
    subCategoryId: z.subCategoryId,
    sequence: z.sequence,
    quizNo: z.quizNo,
    difficulty: z.difficulty,
    isPublished: z.isPublished,
    // datetime-local wants local wall clock without the zone or seconds.
    releaseAt: z.releaseAt ? toLocalInput(z.releaseAt) : "",
    batchIds: z.batches.map((b) => b.batch.id),
    batches: z.batches.map((b) => b.batch),
    studentIds: z.students.map((s) => s.userId),
    sources: z.sources.map((src) => ({
      id: src.id,
      title: src.title,
      kind: src.batchNoteId
        ? ("BATCH_NOTE" as const)
        : src.lessonId
          ? ("LESSON" as const)
          : src.studyMaterialId
            ? ("STUDY_MATERIAL" as const)
            : ("TEXT" as const),
      where: src.batchNote?.batch.name ?? src.studyMaterial?.course?.title ?? null,
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
      // Its permanent number, the academy's own handle on the paper.
      quizNo: await nextQuizNo(),
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
 * The next permanent quiz number — one sequence across the whole academy, and
 * never reused or renumbered. (`sequence`, below, is the order inside a group
 * and can be rearranged; this cannot.)
 */
async function nextQuizNo(): Promise<number> {
  const top = await prisma.quiz.findFirst({
    orderBy: { quizNo: "desc" },
    select: { quizNo: true },
  });
  return (top?.quizNo ?? 0) + 1;
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
      perQuestionSeconds: input.perQuestionSeconds ?? null,
      passingScore: input.passingScore,
      gradingMode: input.gradingMode,
      maxAttempts: input.maxAttempts,
      shuffleQuestions: input.shuffleQuestions,
      showAnswers: input.showAnswers,
      showAnswerPerQuestion: input.showAnswerPerQuestion,
      difficulty: input.difficulty,
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
export async function backfillQuizNumbers(): Promise<number> {
  const rows = await prisma.quiz.findMany({
    where: { quizNo: { lte: 0 } },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (rows.length === 0) return 0;
  let next = await nextQuizNo();
  const cases = rows.map((r) => Prisma.sql`WHEN ${r.id} THEN ${next++}`);
  // One statement, for the reason given on `reorderQuizzes`.
  await prisma.$executeRaw`
    UPDATE \`Quiz\`
    SET quizNo = CASE id ${Prisma.join(cases, " ")} END
    WHERE id IN (${Prisma.join(rows.map((r) => Prisma.sql`${r.id}`))})
  `;
  return rows.length;
}

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

export async function deleteQuiz(id: string, deletedById: string): Promise<void> {
  const existing = await prisma.quiz.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw AppError.notFound("Quiz not found.");
  // Copied into the recycle bin first, so it can be put back.
  await moveToTrash("QUIZ", id, deletedById);
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

// ── List-level import / export ──────────────────────────────────────────────

/**
 * The quiz list as a spreadsheet, and the same sheet read back in.
 *
 * The academy already had this inside a quiz for its questions; this is the
 * level above — the papers themselves, narrowed the same way the study
 * material export narrows, with the columns they tick.
 */

export interface QuizExportOptions {
  columns?: string[];
  search?: string;
  groupId?: string;
  courseId?: string;
  batchId?: string;
  status?: string;
  difficulty?: string;
  ids?: string[];
  createdFrom?: string;
  createdTo?: string;
}

interface QuizExportRow {
  id: string;
  quizNo: number;
  title: string;
  description: string | null;
  groupPaths: string[];
  categoryName: string | null;
  subCategoryName: string | null;
  courseTitle: string | null;
  batchNames: string[];
  difficulty: string;
  passingScore: number;
  timeLimitMinutes: number | null;
  perQuestionSeconds: number | null;
  isPublished: boolean;
  questions: number;
  attempts: number;
  createdByName: string;
}

function quizColumnValue(key: QuizExportColumn, z: QuizExportRow): string | number {
  switch (key) {
    case "quizNo": return z.quizNo;
    case "title": return z.title;
    case "description": return z.description ?? "";
    case "folder": return z.groupPaths.join(" | ");
    case "category": return z.categoryName ?? "";
    case "subCategory": return z.subCategoryName ?? "";
    case "course": return z.courseTitle ?? "";
    case "batches": return z.batchNames.join(" | ");
    case "difficulty": return z.difficulty;
    case "passingScore": return z.passingScore;
    case "timeLimitMinutes": return z.timeLimitMinutes ?? "";
    case "perQuestionSeconds": return z.perQuestionSeconds ?? "";
    case "isPublished": return z.isPublished ? "yes" : "no";
    case "questions": return z.questions;
    case "attempts": return z.attempts;
    case "createdBy": return z.createdByName;
  }
}

function wantedQuizColumns(columns?: string[]): QuizExportColumn[] {
  const known = new Set(QUIZ_EXPORT_COLUMNS.map((c) => c.key as string));
  const picked = (columns ?? []).filter((c) => known.has(c)) as QuizExportColumn[];
  return picked.length > 0 ? picked : DEFAULT_QUIZ_COLUMNS;
}

const quizHeaders = (columns: QuizExportColumn[]) =>
  columns.map((key) => QUIZ_EXPORT_COLUMNS.find((c) => c.key === key)?.label ?? key);

export async function exportQuizzes(
  opts: QuizExportOptions = {},
  ownerId?: string,
): Promise<string> {
  const picked = wantedQuizColumns(opts.columns);
  // A folder filter reaches everything beneath it, as it does everywhere else.
  const inGroup = opts.groupId ? await itemsInGroups("QUIZ", [opts.groupId]) : null;

  const and: Prisma.QuizWhereInput[] = [];
  if (opts.search) and.push({ title: { contains: opts.search } });
  if (opts.courseId) and.push({ courseId: opts.courseId });
  if (opts.batchId) and.push({ batches: { some: { batchId: opts.batchId } } });
  if (opts.status === "yes") and.push({ isPublished: true });
  if (opts.status === "no") and.push({ isPublished: false });
  // Only a difficulty the schema knows — anything else would be rejected by the
  // database rather than simply matching nothing.
  if (opts.difficulty && DIFFICULTIES.has(opts.difficulty)) {
    and.push({ difficulty: opts.difficulty as Prisma.QuizWhereInput["difficulty"] });
  }
  if (opts.ids && opts.ids.length > 0) and.push({ id: { in: opts.ids } });
  if (inGroup) and.push({ id: { in: inGroup } });
  if (opts.createdFrom || opts.createdTo) {
    and.push({
      createdAt: {
        ...(opts.createdFrom ? { gte: new Date(`${opts.createdFrom}T00:00:00.000Z`) } : {}),
        ...(opts.createdTo ? { lte: new Date(`${opts.createdTo}T23:59:59.999Z`) } : {}),
      },
    });
  }
  if (ownerId) {
    and.push({ OR: [{ createdById: ownerId }, { course: { instructorId: ownerId } }] });
  }

  const rows = await prisma.quiz.findMany({
    where: and.length > 0 ? { AND: and } : {},
    orderBy: [{ sequence: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      quizNo: true,
      title: true,
      description: true,
      difficulty: true,
      passingScore: true,
      timeLimitMinutes: true,
      perQuestionSeconds: true,
      isPublished: true,
      course: { select: { title: true } },
      category: { select: { name: true } },
      subCategory: { select: { name: true } },
      batches: { select: { batch: { select: { name: true } } } },
      createdBy: { select: { name: true } },
      _count: { select: { questions: true, attempts: true } },
    },
  });

  const [membership, options] = await Promise.all([
    groupsOfMany("QUIZ", rows.map((r) => r.id)),
    groupOptions("QUIZ"),
  ]);
  const pathOf = new Map(options.map((o) => [o.id, o.path]));

  return toCsv(
    quizHeaders(picked),
    rows.map((z) => {
      const row: QuizExportRow = {
        id: z.id,
        quizNo: z.quizNo,
        title: z.title,
        description: z.description,
        groupPaths: (membership.get(z.id) ?? [])
          .map((g) => pathOf.get(g) ?? "")
          .filter(Boolean),
        categoryName: z.category?.name ?? null,
        subCategoryName: z.subCategory?.name ?? null,
        courseTitle: z.course?.title ?? null,
        batchNames: z.batches.map((b) => b.batch.name),
        difficulty: z.difficulty,
        passingScore: z.passingScore,
        timeLimitMinutes: z.timeLimitMinutes,
        perQuestionSeconds: z.perQuestionSeconds,
        isPublished: z.isPublished,
        questions: z._count.questions,
        attempts: z._count.attempts,
        createdByName: z.createdBy.name,
      };
      return picked.map((key) => quizColumnValue(key, row));
    }),
  );
}

/** A blank sheet with the chosen columns and one row to copy. */
export function quizSampleSheet(columns?: string[]): string {
  const picked = wantedQuizColumns(columns);
  const example: Record<QuizExportColumn, string> = {
    quizNo: "1",
    title: "ICD Coding — Chapter 1",
    description: "Covers the first chapter's code ranges",
    folder: "Medical Coding → ICD Coding Quiz",
    category: "Medical Coding",
    subCategory: "ICD Coding Quiz",
    course: "Medical Coding Course, 2026",
    batches: "Batch 001 | Batch 002",
    difficulty: "INTERMEDIATE",
    passingScore: "40",
    timeLimitMinutes: "30",
    perQuestionSeconds: "60",
    isPublished: "no",
    questions: "",
    attempts: "",
    createdBy: "",
  };
  return toCsv(quizHeaders(picked), [picked.map((key) => example[key])]);
}

export interface QuizImportResult {
  created: number;
  updated: number;
  skipped: { row: number; reason: string }[];
}

/** The real difficulty values — an unknown one in a sheet falls back to EASY. */
const DIFFICULTIES = new Set<string>(QUIZ_DIFFICULTIES);

/**
 * Bring quizzes in from a spreadsheet. A title that already exists is updated
 * rather than duplicated — the same rule the study material importer follows,
 * so an export can be edited and sent straight back.
 *
 * Questions are not touched here: a quiz's paper has its own importer, where a
 * row is a question. This sheet is the papers themselves.
 */
export async function importQuizzes(
  csv: string,
  createdById: string,
): Promise<QuizImportResult> {
  const { rows } = parseCsv(csv);
  const result: QuizImportResult = { created: 0, updated: 0, skipped: [] };
  if (rows.length === 0) return result;

  const [courses, existing, folders] = await Promise.all([
    prisma.course.findMany({ select: { id: true, title: true } }),
    prisma.quiz.findMany({ select: { id: true, title: true } }),
    groupOptions("QUIZ"),
  ]);
  const courseByName = new Map(courses.map((c) => [c.title.trim().toLowerCase(), c.id]));
  const quizByTitle = new Map(existing.map((q) => [q.title.trim().toLowerCase(), q.id]));
  const folderByPath = new Map(folders.map((f) => [f.path.trim().toLowerCase(), f.id]));

  const pick = (row: Record<string, string>, ...names: string[]): string => {
    for (const name of names) {
      const hit = Object.keys(row).find(
        (k) => k.trim().toLowerCase() === name.toLowerCase(),
      );
      if (hit && row[hit]?.trim()) return row[hit].trim();
    }
    return "";
  };
  const yes = (v: string) => ["yes", "y", "true", "1"].includes(v.trim().toLowerCase());
  // An empty cell means "not set", not zero — a blank time limit is no limit,
  // and a blank pass mark takes the default rather than letting everyone pass.
  const num = (v: string) => {
    if (!v.trim()) return null;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
  };

  for (const [i, row] of rows.entries()) {
    const line = i + 2; // the header is row 1
    const title = pick(row, "title", "quiz", "name");
    if (!title) {
      result.skipped.push({ row: line, reason: "No title" });
      continue;
    }

    const courseName = pick(row, "course");
    const courseId = courseName
      ? (courseByName.get(courseName.toLowerCase()) ?? null)
      : null;
    if (courseName && !courseId) {
      result.skipped.push({ row: line, reason: `No course called "${courseName}"` });
      continue;
    }

    // Sheets are typed by hand: "Very difficult" has to reach VERY_DIFFICULT.
    const difficultyRaw = pick(row, "difficulty").trim().toUpperCase().replace(/[\s-]+/g, "_");
    const difficulty = DIFFICULTIES.has(difficultyRaw) ? difficultyRaw : "EASY";
    const data = {
      title,
      description: pick(row, "description") || null,
      courseId,
      difficulty: difficulty as Prisma.QuizCreateInput["difficulty"],
      passingScore: num(pick(row, "pass mark %", "passingScore", "pass mark")) ?? 40,
      timeLimitMinutes: num(pick(row, "time limit (min)", "timeLimitMinutes", "time limit")),
      perQuestionSeconds: num(
        pick(row, "per-question (sec)", "perQuestionSeconds", "per question"),
      ),
      isPublished: yes(pick(row, "published", "isPublished")),
    };

    const found = quizByTitle.get(title.trim().toLowerCase());
    let quizId: string;
    if (found) {
      await prisma.quiz.update({ where: { id: found }, data });
      quizId = found;
      result.updated += 1;
    } else {
      const made = await prisma.quiz.create({
        data: {
          ...data,
          quizNo: await nextQuizNo(),
          sequence: await nextSequence(null, null),
          createdById,
        },
        select: { id: true },
      });
      quizId = made.id;
      quizByTitle.set(title.trim().toLowerCase(), quizId);
      result.created += 1;
    }

    // A folder named in the sheet files it there, when that folder exists.
    const folderPath = pick(row, "folder");
    if (folderPath) {
      const groupId = folderByPath.get(folderPath.trim().toLowerCase());
      if (groupId) await setGroupsFor("QUIZ", quizId, [groupId]);
    }
  }

  return result;
}

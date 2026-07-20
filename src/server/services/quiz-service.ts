import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { AppError } from "@/lib/api/errors";
import type {
  CreateQuizInput,
  UpdateQuizInput,
  QuestionInput,
} from "@/lib/validations/quiz";

// ── Reads ────────────────────────────────────────────────────────────────────

export interface QuizListQuery {
  page: number;
  pageSize: number;
  search?: string;
  courseId?: string;
  status?: string; // PUBLISHED | DRAFT
  /** Scope to quizzes an instructor created or owns via the course. */
  ownerId?: string;
}

export async function listQuizzesAdmin(q: QuizListQuery) {
  const and: Prisma.QuizWhereInput[] = [];
  if (q.search) and.push({ title: { contains: q.search } });
  if (q.courseId) and.push({ courseId: q.courseId });
  if (q.status === "PUBLISHED") and.push({ isPublished: true });
  if (q.status === "DRAFT") and.push({ isPublished: false });
  if (q.ownerId) {
    and.push({ OR: [{ createdById: q.ownerId }, { course: { instructorId: q.ownerId } }] });
  }
  const where: Prisma.QuizWhereInput = and.length ? { AND: and } : {};

  const [total, rows] = await Promise.all([
    prisma.quiz.count({ where }),
    prisma.quiz.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      include: {
        course: { select: { title: true } },
        createdBy: { select: { name: true } },
        _count: { select: { questions: true, attempts: true } },
      },
    }),
  ]);

  return {
    total,
    quizzes: rows.map((z) => ({
      id: z.id,
      title: z.title,
      courseId: z.courseId,
      courseTitle: z.course?.title ?? null,
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
    isPublished: z.isPublished,
    questions: z.questions.map((q) => ({
      id: q.id,
      type: q.type,
      text: q.text,
      points: q.points,
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
  const z = await prisma.quiz.create({
    data: {
      title: input.title,
      courseId: input.courseId || null,
      createdById,
    },
    select: { id: true },
  });
  return z.id;
}

export async function updateQuiz(id: string, input: UpdateQuizInput): Promise<void> {
  const existing = await prisma.quiz.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw AppError.notFound("Quiz not found.");
  await prisma.quiz.update({
    where: { id },
    data: {
      title: input.title,
      description: input.description || null,
      courseId: input.courseId || null,
      timeLimitMinutes: input.timeLimitMinutes ?? null,
      passingScore: input.passingScore,
      gradingMode: input.gradingMode,
      maxAttempts: input.maxAttempts,
      shuffleQuestions: input.shuffleQuestions,
      showAnswers: input.showAnswers,
    },
  });
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

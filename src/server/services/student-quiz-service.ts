import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { AppError } from "@/lib/api/errors";
import type { SubmitQuizInput } from "@/lib/validations/quiz-attempt";

// ── Reads ────────────────────────────────────────────────────────────────────

export interface StudentQuiz {
  id: string;
  title: string;
  description: string | null;
  courseTitle: string | null;
  questionCount: number;
  totalPoints: number;
  passingScore: number;
  maxAttempts: number;
  attemptsUsed: number;
  bestPercent: number | null;
  passed: boolean;
}

export async function listStudentQuizzes(userId: string): Promise<StudentQuiz[]> {
  const enrollments = await prisma.enrollment.findMany({
    where: { userId, status: { in: ["ACTIVE", "COMPLETED"] } },
    select: { courseId: true },
  });
  const courseIds = enrollments.map((e) => e.courseId);
  if (courseIds.length === 0) return [];

  const quizzes = await prisma.quiz.findMany({
    where: { courseId: { in: courseIds }, isPublished: true },
    orderBy: { updatedAt: "desc" },
    include: {
      course: { select: { title: true } },
      questions: { select: { points: true } },
      attempts: { where: { studentId: userId }, select: { score: true, maxScore: true } },
    },
  });

  return quizzes.map((z) => {
    const totalPoints = z.questions.reduce((s, q) => s + q.points, 0);
    const percents = z.attempts
      .filter((a) => a.score != null && a.maxScore > 0)
      .map((a) => Math.round(((a.score as number) / a.maxScore) * 100));
    const best = percents.length ? Math.max(...percents) : null;
    return {
      id: z.id,
      title: z.title,
      description: z.description,
      courseTitle: z.course?.title ?? null,
      questionCount: z.questions.length,
      totalPoints,
      passingScore: z.passingScore,
      maxAttempts: z.maxAttempts,
      attemptsUsed: z.attempts.length,
      bestPercent: best,
      passed: best != null && best >= z.passingScore,
    };
  });
}

/** Quiz + questions for taking — WITHOUT correct-answer flags. */
export async function getQuizForAttempt(userId: string, quizId: string) {
  const quiz = await prisma.quiz.findFirst({
    where: { id: quizId, isPublished: true },
    include: {
      course: { select: { id: true, title: true } },
      questions: {
        orderBy: { order: "asc" },
        include: { options: { orderBy: { order: "asc" }, select: { id: true, text: true } } },
      },
    },
  });
  if (!quiz || !quiz.courseId) return null;

  const enrolled = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId, courseId: quiz.courseId } },
    select: { id: true },
  });
  if (!enrolled) return null;

  const attemptsUsed = await prisma.quizAttempt.count({ where: { quizId, studentId: userId } });

  return {
    id: quiz.id,
    title: quiz.title,
    description: quiz.description,
    courseTitle: quiz.course?.title ?? null,
    timeLimitMinutes: quiz.timeLimitMinutes,
    passingScore: quiz.passingScore,
    maxAttempts: quiz.maxAttempts,
    attemptsUsed,
    canAttempt: attemptsUsed < quiz.maxAttempts,
    totalPoints: quiz.questions.reduce((s, q) => s + q.points, 0),
    questions: quiz.questions.map((q) => ({
      id: q.id,
      type: q.type,
      text: q.text,
      points: q.points,
      options: q.options,
    })),
  };
}

// ── Submit + auto-grade ──────────────────────────────────────────────────────

export interface QuizResult {
  score: number;
  maxScore: number;
  percent: number;
  passed: boolean;
  passingScore: number;
  attemptNo: number;
  breakdown: {
    questionId: string;
    isCorrect: boolean | null;
    correctOptionIds: string[];
    yourOptionIds: string[];
    explanation: string | null;
  }[];
  showAnswers: boolean;
}

export async function submitQuizAttempt(
  userId: string,
  quizId: string,
  input: SubmitQuizInput,
): Promise<QuizResult> {
  const quiz = await prisma.quiz.findFirst({
    where: { id: quizId, isPublished: true },
    include: {
      questions: { include: { options: { select: { id: true, isCorrect: true } } } },
    },
  });
  if (!quiz || !quiz.courseId) throw AppError.notFound("Quiz not found.");

  const enrolled = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId, courseId: quiz.courseId } },
    select: { id: true },
  });
  if (!enrolled) throw AppError.forbidden("You're not enrolled in this course.");

  const attemptsUsed = await prisma.quizAttempt.count({ where: { quizId, studentId: userId } });
  if (attemptsUsed >= quiz.maxAttempts) {
    throw AppError.badRequest("You've used all your attempts for this quiz.");
  }

  const answerMap = new Map(input.answers.map((a) => [a.questionId, a.optionIds]));

  let score = 0;
  let maxScore = 0;
  const breakdown: QuizResult["breakdown"] = [];
  const responses: { questionId: string; selected: string[]; isCorrect: boolean | null; points: number }[] = [];

  for (const q of quiz.questions) {
    maxScore += q.points;
    const selected = answerMap.get(q.id) ?? [];
    const correctIds = q.options.filter((o) => o.isCorrect).map((o) => o.id).sort();

    let isCorrect: boolean | null;
    let points = 0;
    if (q.type === "SHORT_ANSWER") {
      isCorrect = null; // needs manual grading
    } else {
      const sel = [...selected].sort();
      isCorrect = correctIds.length === sel.length && correctIds.every((id, i) => id === sel[i]);
      points = isCorrect ? q.points : 0;
    }
    score += points;
    responses.push({ questionId: q.id, selected, isCorrect, points });
    breakdown.push({
      questionId: q.id,
      isCorrect,
      correctOptionIds: correctIds,
      yourOptionIds: selected,
      explanation: q.explanation,
    });
  }

  const percent = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
  const passed = percent >= quiz.passingScore;
  const attemptNo = attemptsUsed + 1;
  const now = new Date();

  const attempt = await prisma.quizAttempt.create({
    data: {
      quizId,
      studentId: userId,
      attemptNo,
      status: "GRADED",
      score,
      maxScore,
      timeSpentSeconds: input.timeSpentSeconds ?? 0,
      submittedAt: now,
      gradedAt: now,
      responses: {
        create: responses.map((r) => ({
          questionId: r.questionId,
          selectedOptions: r.selected as Prisma.InputJsonValue,
          isCorrect: r.isCorrect,
          pointsAwarded: r.points,
        })),
      },
    },
    select: { id: true },
  });
  void attempt;

  return {
    score,
    maxScore,
    percent,
    passed,
    passingScore: quiz.passingScore,
    attemptNo,
    breakdown,
    showAnswers: quiz.showAnswers,
  };
}

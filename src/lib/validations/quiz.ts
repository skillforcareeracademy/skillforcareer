import { z } from "zod";

export const QUESTION_TYPES = [
  "SINGLE_CHOICE",
  "MULTIPLE_CHOICE",
  "TRUE_FALSE",
  "SHORT_ANSWER",
] as const;
export const GRADING_MODES = ["AUTO", "MANUAL"] as const;

export const QUESTION_TYPE_LABEL: Record<string, string> = {
  SINGLE_CHOICE: "Single choice",
  MULTIPLE_CHOICE: "Multiple choice",
  TRUE_FALSE: "True / False",
  SHORT_ANSWER: "Short answer",
};
export const GRADING_MODE_LABEL: Record<string, string> = {
  AUTO: "Auto-graded",
  MANUAL: "Manual",
};

/** Minimal create — settings + questions live on the editor page. */
export const createQuizSchema = z.object({
  title: z.string().trim().min(3, "Title is too short").max(150),
  courseId: z.string().optional().or(z.literal("")),
});

export const updateQuizSchema = z.object({
  title: z.string().trim().min(3, "Title is too short").max(150),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  courseId: z.string().optional().or(z.literal("")),
  /** Cohorts this quiz is set for. Empty = everyone on the course. */
  batchIds: z.array(z.string().min(1)).max(200).optional(),
  timeLimitMinutes: z.coerce.number().int().min(1).max(1440).optional(),
  passingScore: z.coerce.number().int().min(0).max(100).default(60),
  gradingMode: z.enum(GRADING_MODES).default("AUTO"),
  maxAttempts: z.coerce.number().int().min(1).max(50).default(1),
  shuffleQuestions: z.boolean().default(false),
  showAnswers: z.boolean().default(true),
});

const optionSchema = z.object({
  text: z.string().trim().min(1, "Option text is required").max(500),
  isCorrect: z.boolean().default(false),
});

export const questionSchema = z
  .object({
    type: z.enum(QUESTION_TYPES),
    text: z.string().trim().min(1, "Question text is required").max(2000),
    points: z.coerce.number().int().min(1).max(100).default(1),
    /** Model answer for written questions — for the marker, and for export. */
    correctAnswer: z.string().trim().max(4000).optional().or(z.literal("")),
    explanation: z.string().trim().max(2000).optional().or(z.literal("")),
    options: z.array(optionSchema).max(10).default([]),
  })
  .superRefine((q, ctx) => {
    if (q.type === "SHORT_ANSWER") return;
    if (q.options.length < 2) {
      ctx.addIssue({ code: "custom", message: "Add at least 2 options.", path: ["options"] });
    }
    const correct = q.options.filter((o) => o.isCorrect).length;
    if (correct < 1) {
      ctx.addIssue({ code: "custom", message: "Mark at least one option correct.", path: ["options"] });
    }
    if (q.type === "SINGLE_CHOICE" || q.type === "TRUE_FALSE") {
      if (correct > 1) {
        ctx.addIssue({ code: "custom", message: "Only one option can be correct.", path: ["options"] });
      }
    }
  });

export const reorderQuestionsSchema = z.object({
  ids: z.array(z.string()).min(1),
});

/** Bulk question upload — the same shape the export produces. */
export const importQuestionsSchema = z.object({
  questions: z.array(questionSchema).min(1, "Nothing to import").max(500),
  /** Replace what's there rather than appending. */
  replace: z.boolean().default(false),
});

export type CreateQuizInput = z.infer<typeof createQuizSchema>;
export type UpdateQuizInput = z.infer<typeof updateQuizSchema>;
export type QuestionInput = z.infer<typeof questionSchema>;
export type ImportQuestionsInput = z.infer<typeof importQuestionsSchema>;

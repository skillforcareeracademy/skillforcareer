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
  /** Grouping, both optional: a sub-category must belong to the category. */
  categoryId: z.string().optional().or(z.literal("")),
  subCategoryId: z.string().optional().or(z.literal("")),
});

export const updateQuizSchema = z.object({
  title: z.string().trim().min(3, "Title is too short").max(150),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  courseId: z.string().optional().or(z.literal("")),
  /** Cohorts this quiz is set for. Empty = everyone on the course. */
  batchIds: z.array(z.string().min(1)).max(200).optional(),
  /** Extra individuals on top of the batches — mirrors assignments. */
  studentIds: z.array(z.string().min(1)).max(2000).optional(),
  /** Hidden from learners until this moment. Blank = as soon as it's published. */
  releaseAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Invalid date/time")
    .optional()
    .or(z.literal("")),
  timeLimitMinutes: z.coerce.number().int().min(1).max(1440).optional(),
  passingScore: z.coerce.number().int().min(0).max(100).default(60),
  gradingMode: z.enum(GRADING_MODES).default("AUTO"),
  /** 0 = unlimited, falling back to the platform default in Settings. */
  maxAttempts: z.coerce.number().int().min(0).max(50).default(1),
  shuffleQuestions: z.boolean().default(false),
  /** The whole answer key, once the paper is submitted. */
  showAnswers: z.boolean().default(true),
  /** Mark each question the moment it is answered. */
  showAnswerPerQuestion: z.boolean().default(false),
  categoryId: z.string().optional().or(z.literal("")),
  subCategoryId: z.string().optional().or(z.literal("")),
});

// ── Grouping, sequencing and notes ───────────────────────────────────────────

export const quizCategorySchema = z.object({
  name: z.string().trim().min(2, "Name is too short").max(80),
  /** Set = this is a sub-category of that category. */
  parentId: z.string().optional().or(z.literal("")),
});

/** The visible group, in the order it should be numbered 1…n. */
export const reorderQuizzesSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(500),
});

/** Notes a quiz was prepared from: a batch note, a lesson, or pasted text. */
export const quizSourceSchema = z
  .object({
    batchNoteId: z.string().optional().or(z.literal("")),
    lessonId: z.string().optional().or(z.literal("")),
    title: z.string().trim().max(150).optional().or(z.literal("")),
    text: z.string().trim().max(200_000).optional().or(z.literal("")),
  })
  .superRefine((v, ctx) => {
    if (!v.batchNoteId && !v.lessonId && !v.text) {
      ctx.addIssue({ code: "custom", message: "Choose notes or paste the text.", path: ["batchNoteId"] });
    }
    if (v.batchNoteId && v.lessonId) {
      ctx.addIssue({ code: "custom", message: "Pick one set of notes at a time.", path: ["lessonId"] });
    }
    if (!v.batchNoteId && !v.lessonId && v.text && v.text.length < 200) {
      ctx.addIssue({
        code: "custom",
        message: "Paste at least a couple of paragraphs of notes.",
        path: ["text"],
      });
    }
  });

export const GENERATE_STYLES = ["MIXED", "SINGLE_CHOICE", "MULTIPLE_CHOICE", "TRUE_FALSE"] as const;
export const GENERATE_STYLE_LABEL: Record<string, string> = {
  MIXED: "Mixed",
  SINGLE_CHOICE: "Single choice",
  MULTIPLE_CHOICE: "Multiple choice",
  TRUE_FALSE: "True / False",
};

/** Draft questions from notes. `save` writes them onto the quiz. */
export const generateQuestionsSchema = z.object({
  sourceId: z.string().optional().or(z.literal("")),
  batchNoteId: z.string().optional().or(z.literal("")),
  lessonId: z.string().optional().or(z.literal("")),
  text: z.string().trim().max(200_000).optional().or(z.literal("")),
  count: z.coerce.number().int().min(1).max(25).default(5),
  style: z.enum(GENERATE_STYLES).default("MIXED"),
  /** Keep the notes on the quiz as the source it was prepared from. */
  linkSource: z.boolean().default(true),
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
export type QuizCategoryInput = z.infer<typeof quizCategorySchema>;
export type QuizSourceInput = z.infer<typeof quizSourceSchema>;
export type GenerateQuestionsInput = z.infer<typeof generateQuestionsSchema>;
export type UpdateQuizInput = z.infer<typeof updateQuizSchema>;
export type QuestionInput = z.infer<typeof questionSchema>;
export type ImportQuestionsInput = z.infer<typeof importQuestionsSchema>;

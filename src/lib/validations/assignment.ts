import { z } from "zod";
import { optionalMediaUrl } from "./url";

export const SUBMISSION_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "GRADED",
  "RESUBMIT_REQUESTED",
  "LATE",
] as const;

export const SUBMISSION_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  GRADED: "Graded",
  RESUBMIT_REQUESTED: "Resubmit",
  LATE: "Late",
};

/**
 * What shape an assignment takes. `FILE` is the original free-text/upload
 * submission; `MCQ` and `QNA` turn it into a question paper, marked the way a
 * quiz is.
 */
export const ASSIGNMENT_TYPES = ["FILE", "MCQ", "QNA"] as const;
export const ASSIGNMENT_TYPE_LABEL: Record<string, string> = {
  FILE: "File / written submission",
  MCQ: "MCQ — multiple choice",
  QNA: "Q&A — written answers",
};

export const ASSIGNMENT_GRADING_MODES = ["AUTO", "MANUAL"] as const;
export const ASSIGNMENT_GRADING_MODE_LABEL: Record<string, string> = {
  AUTO: "Auto-graded",
  MANUAL: "Marked by hand",
};

const DT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/; // datetime-local value
const D = /^\d{4}-\d{2}-\d{2}$/; // date input value

export const assignmentSchema = z
  .object({
    title: z.string().trim().min(3, "Title is too short").max(150),
    description: z.string().trim().max(2000).optional().or(z.literal("")),
    instructions: z.string().trim().max(8000).optional().or(z.literal("")),
    courseId: z.string().optional().or(z.literal("")),
    type: z.enum(ASSIGNMENT_TYPES).default("FILE"),
    gradingMode: z.enum(ASSIGNMENT_GRADING_MODES).default("MANUAL"),
    maxScore: z.coerce.number().int().min(1).max(1000).default(100),
    dueDate: z.string().regex(DT, "Invalid date/time").optional().or(z.literal("")),
    allowLate: z.boolean().default(false),
    /** Empty = everyone on the course. */
    batchIds: z.array(z.string().min(1)).max(200).optional(),
    /** Extra individuals, on top of whatever the batches cover. */
    studentIds: z.array(z.string().min(1)).max(2000).optional(),
  })
  .superRefine((a, ctx) => {
    // Written answers need a person to read them; auto-marking would score
    // every submission zero.
    if (a.type === "QNA" && a.gradingMode === "AUTO") {
      ctx.addIssue({
        code: "custom",
        message: "Written answers have to be marked by hand.",
        path: ["gradingMode"],
      });
    }
  });

export const createAssignmentSchema = assignmentSchema;
export const updateAssignmentSchema = assignmentSchema;

/**
 * Bulk upload — a whole term's assignments from one sheet.
 *
 * Rows are matched to courses and batches by *name*, not by id, because the
 * sheet is written by a person looking at the timetable, not at the database.
 * Resolution happens server-side so the same rules apply however the CSV
 * arrives.
 */
export const importAssignmentRowSchema = z.object({
  title: z.string().trim().min(3, "Title is too short").max(150),
  description: z.string().trim().max(2000).default(""),
  instructions: z.string().trim().max(8000).default(""),
  /** Course title, slug or id — resolved on the server. */
  course: z.string().trim().max(200).default(""),
  /** Batch names or codes, comma-separated. Blank = everyone on the course. */
  batches: z.string().trim().max(500).default(""),
  type: z.string().trim().max(40).default("FILE"),
  gradingMode: z.string().trim().max(40).default("MANUAL"),
  maxScore: z.coerce.number().int().min(1).max(1000).default(100),
  /** `2026-09-30` or `2026-09-30T17:00`; blank means no deadline. */
  dueDate: z.string().trim().max(40).default(""),
  allowLate: z.string().trim().max(10).default(""),
});

export const importAssignmentsSchema = z.object({
  rows: z.array(importAssignmentRowSchema).min(1, "Nothing to import").max(500),
});

export type ImportAssignmentRow = z.infer<typeof importAssignmentRowSchema>;
export type ImportAssignmentsInput = z.infer<typeof importAssignmentsSchema>;

/** The sheet's columns, shared by the template, the parser and the docs. */
export const ASSIGNMENT_CSV_COLUMNS = [
  "Title",
  "Course",
  "Batches",
  "Type",
  "Grading",
  "Max score",
  "Due date",
  "Allow late",
  "Description",
  "Instructions",
] as const;

export const gradeSubmissionSchema = z.object({
  score: z.coerce.number().int().min(0).max(1000),
  feedback: z.string().trim().max(5000).optional().or(z.literal("")),
  status: z.enum(["GRADED", "RESUBMIT_REQUESTED"]).default("GRADED"),
});

// ── Questions ────────────────────────────────────────────────────────────────

export const ASSIGNMENT_QUESTION_TYPES = [
  "SINGLE_CHOICE",
  "MULTIPLE_CHOICE",
  "TRUE_FALSE",
  "SHORT_ANSWER",
] as const;

export const ASSIGNMENT_QUESTION_TYPE_LABEL: Record<string, string> = {
  SINGLE_CHOICE: "Single choice",
  MULTIPLE_CHOICE: "Multiple choice",
  TRUE_FALSE: "True / False",
  SHORT_ANSWER: "Written answer",
};

const optionSchema = z.object({
  text: z.string().trim().min(1, "Option text is required").max(500),
  isCorrect: z.boolean().default(false),
});

export const assignmentQuestionSchema = z
  .object({
    type: z.enum(ASSIGNMENT_QUESTION_TYPES),
    text: z.string().trim().min(1, "Question text is required").max(2000),
    points: z.coerce.number().int().min(1).max(100).default(1),
    /** The model answer a marker checks written responses against. */
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
      ctx.addIssue({
        code: "custom",
        message: "Mark at least one option correct.",
        path: ["options"],
      });
    }
    if ((q.type === "SINGLE_CHOICE" || q.type === "TRUE_FALSE") && correct > 1) {
      ctx.addIssue({
        code: "custom",
        message: "Only one option can be correct.",
        path: ["options"],
      });
    }
  });

export const reorderAssignmentQuestionsSchema = z.object({
  ids: z.array(z.string()).min(1),
});

/** Bulk question upload — the same shape the export produces. */
export const importAssignmentQuestionsSchema = z.object({
  questions: z.array(assignmentQuestionSchema).min(1, "Nothing to import").max(500),
  /** Replace what's there rather than appending. */
  replace: z.boolean().default(false),
});

// ── Student submission of a question paper ───────────────────────────────────

export const assignmentAnswersSchema = z.object({
  answers: z
    .array(
      z.object({
        questionId: z.string().min(1),
        optionIds: z.array(z.string()).max(10).default([]),
        text: z.string().max(8000).optional().or(z.literal("")),
      }),
    )
    .max(500),
  fileUrl: optionalMediaUrl,
});

// ── Admin list filters ───────────────────────────────────────────────────────

export const assignmentFilterSchema = z.object({
  batchId: z.string().optional(),
  dueFrom: z.string().regex(D).optional(),
  dueTo: z.string().regex(D).optional(),
});

export type AssignmentInput = z.infer<typeof assignmentSchema>;
export type GradeSubmissionInput = z.infer<typeof gradeSubmissionSchema>;
export type AssignmentQuestionInput = z.infer<typeof assignmentQuestionSchema>;
export type ImportAssignmentQuestionsInput = z.infer<typeof importAssignmentQuestionsSchema>;
export type AssignmentAnswersInput = z.infer<typeof assignmentAnswersSchema>;

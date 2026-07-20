import { z } from "zod";

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

const DT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/; // datetime-local value

export const assignmentSchema = z.object({
  title: z.string().trim().min(3, "Title is too short").max(150),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  instructions: z.string().trim().max(8000).optional().or(z.literal("")),
  courseId: z.string().optional().or(z.literal("")),
  maxScore: z.coerce.number().int().min(1).max(1000).default(100),
  dueDate: z.string().regex(DT, "Invalid date/time").optional().or(z.literal("")),
  allowLate: z.boolean().default(false),
});

export const createAssignmentSchema = assignmentSchema;
export const updateAssignmentSchema = assignmentSchema;

export const gradeSubmissionSchema = z.object({
  score: z.coerce.number().int().min(0).max(1000),
  feedback: z.string().trim().max(5000).optional().or(z.literal("")),
  status: z.enum(["GRADED", "RESUBMIT_REQUESTED"]).default("GRADED"),
});

export type AssignmentInput = z.infer<typeof assignmentSchema>;
export type GradeSubmissionInput = z.infer<typeof gradeSubmissionSchema>;

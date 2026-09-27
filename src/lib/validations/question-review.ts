import { z } from "zod";

/** A learner flagging a question, and the answer that comes back. */
export const raiseReviewSchema = z.object({
  questionId: z.string().min(1),
  /** What they think is wrong. Optional — flagging alone is a signal. */
  message: z.string().trim().max(1000).optional().or(z.literal("")),
});

export const REVIEW_STATUSES = ["RECTIFIED", "INVALID"] as const;

export const answerReviewSchema = z.object({
  status: z.enum(REVIEW_STATUSES),
  /** Blank sends the standard wording for the verdict. */
  reply: z.string().trim().max(1000).optional().or(z.literal("")),
});

export const REVIEW_STATUS_LABEL: Record<string, string> = {
  OPEN: "Waiting",
  RECTIFIED: "Rectified",
  INVALID: "Not an error",
};

export type RaiseReviewInput = z.infer<typeof raiseReviewSchema>;
export type AnswerReviewInput = z.infer<typeof answerReviewSchema>;

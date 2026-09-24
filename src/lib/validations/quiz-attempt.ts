import { z } from "zod";

export const submitQuizSchema = z.object({
  answers: z
    .array(
      z.object({
        questionId: z.string().min(1),
        optionIds: z.array(z.string()).default([]),
        text: z.string().trim().max(2000).optional().or(z.literal("")),
      }),
    )
    .max(200),
  timeSpentSeconds: z.coerce.number().int().min(0).max(360000).optional(),
});

/** Mark one question mid-attempt, for quizzes that answer as you go. */
export const checkAnswerSchema = z.object({
  questionId: z.string().min(1),
  optionIds: z.array(z.string()).max(10).default([]),
});

export type SubmitQuizInput = z.infer<typeof submitQuizSchema>;
export type CheckAnswerInput = z.infer<typeof checkAnswerSchema>;

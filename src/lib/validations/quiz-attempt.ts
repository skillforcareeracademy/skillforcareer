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

export type SubmitQuizInput = z.infer<typeof submitQuizSchema>;

import { z } from "zod";

export const submitAssignmentSchema = z.object({
  content: z.string().trim().min(1, "Write your submission").max(10000),
  fileUrl: z
    .string()
    .trim()
    .max(500)
    .refine((v) => v === "" || /^https?:\/\/.+/.test(v), "Enter a valid link")
    .optional()
    .or(z.literal("")),
});

export type SubmitAssignmentInput = z.infer<typeof submitAssignmentSchema>;

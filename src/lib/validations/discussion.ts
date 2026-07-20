import { z } from "zod";

export const replySchema = z.object({
  body: z.string().trim().min(1, "Reply can't be empty").max(5000),
});

export const createThreadSchema = z.object({
  courseId: z.string().min(1, "Choose a course"),
  title: z.string().trim().min(3, "Add a short title").max(200),
  body: z.string().trim().min(1, "Write your question").max(5000),
});

export type CreateThreadInput = z.infer<typeof createThreadSchema>;

export const moderateThreadSchema = z.object({
  isPinned: z.boolean().optional(),
  isResolved: z.boolean().optional(),
});

export type ReplyInput = z.infer<typeof replySchema>;
export type ModerateThreadInput = z.infer<typeof moderateThreadSchema>;

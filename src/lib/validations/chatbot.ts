import { z } from "zod";

/**
 * One thing Ami knows how to answer.
 *
 * `patterns` is the training surface: the other ways people ask the same thing,
 * and the bare keywords that should fire on their own. Matching is described in
 * `lib/chatbot/match.ts`.
 */
export const chatIntentSchema = z.object({
  question: z
    .string()
    .trim()
    .min(3, "Write the question a visitor would ask")
    .max(300),
  patterns: z.array(z.string().trim().min(1).max(200)).max(25).default([]),
  answer: z
    .string()
    .trim()
    .min(2, "Write the answer Ami should give")
    .max(2000),
  actionLabel: z.string().trim().max(40).optional().or(z.literal("")),
  actionUrl: z.string().trim().max(500).optional().or(z.literal("")),
  category: z.string().trim().max(40).optional().or(z.literal("")),
  /** Offered as a starter chip when the chat window opens. */
  isSuggested: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

export const askSchema = z.object({
  question: z.string().trim().min(1, "Ask me something").max(500),
  /** Groups one visitor's messages into a conversation. Client-generated. */
  sessionId: z.string().trim().min(6).max(64),
});

export type ChatIntentInput = z.infer<typeof chatIntentSchema>;
export type AskInput = z.infer<typeof askSchema>;

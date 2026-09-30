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

/**
 * A row of the training sheet.
 *
 * "AI train krne ke liye questions import export ka option de do" — teaching
 * Ami one dialog at a time is the slow part, and an academy's FAQ already
 * exists as a document. Everything is a loose string here: the sheet is written
 * by a person, and the service is what makes sense of it.
 */
export const importIntentRowSchema = z.object({
  question: z.string().trim().max(300).default(""),
  patterns: z.string().trim().max(2000).default(""),
  answer: z.string().trim().max(2000).default(""),
  category: z.string().trim().max(40).default(""),
  actionLabel: z.string().trim().max(40).default(""),
  actionUrl: z.string().trim().max(500).default(""),
  isSuggested: z.string().trim().max(10).default(""),
  isActive: z.string().trim().max(10).default(""),
});

export const importIntentsSchema = z.object({
  rows: z.array(importIntentRowSchema).min(1, "Nothing to import").max(500),
});

export type ImportIntentRow = z.infer<typeof importIntentRowSchema>;
export type ImportIntentsInput = z.infer<typeof importIntentsSchema>;

/** The sheet's columns, shared by the template, the parser and the dialog. */
export const CHAT_INTENT_CSV_COLUMNS = [
  "Question",
  "Patterns",
  "Answer",
  "Category",
  "Action label",
  "Action URL",
  "Suggested",
  "Active",
] as const;

/** Patterns travel as one cell — a pipe keeps commas usable inside a phrase. */
export const PATTERN_SEPARATOR = "|";

export type ChatIntentInput = z.infer<typeof chatIntentSchema>;
export type AskInput = z.infer<typeof askSchema>;

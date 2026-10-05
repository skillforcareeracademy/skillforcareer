import { z } from "zod";

/** Which assistant is being talked to — see `ChatAudience` in the schema. */
export const CHAT_SURFACES = ["public", "panel"] as const;
export type ChatSurface = (typeof CHAT_SURFACES)[number];

/** Who an answer is written for, as the admin list offers it. */
export const CHAT_AUDIENCES = ["PUBLIC", "INTERNAL", "BOTH"] as const;
export const CHAT_AUDIENCE_LABEL: Record<string, string> = {
  PUBLIC: "Website only",
  INTERNAL: "Inside the panels only",
  BOTH: "Both",
};

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
  /** Which assistant may give this answer. */
  audience: z.enum(CHAT_AUDIENCES).default("PUBLIC"),
  /**
   * Role slugs that may be given it inside the panels — "as per their profile
   * roles and permissions". Empty means anyone signed in.
   */
  roles: z.array(z.string().trim().min(1).max(40)).max(12).default([]),
});

export const askSchema = z.object({
  question: z.string().trim().min(1, "Ask me something").max(500),
  /** Groups one visitor's messages into a conversation. Client-generated. */
  sessionId: z.string().trim().min(6).max(64),
  /** The website assistant, or the one inside a panel. */
  surface: z.enum(CHAT_SURFACES).default("public"),
  /** The page open at the time, so an answer can be about what they see. */
  screen: z.string().trim().max(160).optional().or(z.literal("")),
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
  audience: z.string().trim().max(20).default(""),
  roles: z.string().trim().max(200).default(""),
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
  "Audience",
  "Roles",
] as const;

/** Patterns travel as one cell — a pipe keeps commas usable inside a phrase. */
export const PATTERN_SEPARATOR = "|";

export type ChatIntentInput = z.infer<typeof chatIntentSchema>;
export type AskInput = z.infer<typeof askSchema>;

import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/api/errors";
import { getSettings } from "./settings-service";
import { readMemo, writeMemo, clearMemo } from "./memo";
import {
  findBestMatch,
  nearMisses,
  type MatchableIntent,
} from "@/lib/chatbot/match";
import type { ChatIntentInput } from "@/lib/validations/chatbot";

/**
 * "Ami" — the site assistant, trained entirely from Admin → Assistant.
 *
 * Every answer is one an admin typed. What isn't answered is kept, so the
 * "teach Ami" queue is a real list of what visitors actually asked and nobody
 * had written down yet — which is the point of "jise mai admin panel se trained
 * kr paau".
 */

const MEMO_KEY = "chatbot:intents";
const TTL_MS = 60_000;

export function invalidateChatbot(): void {
  clearMemo(MEMO_KEY);
}

function toPatterns(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((p): p is string => typeof p === "string" && p.trim().length > 0);
}

/**
 * The active knowledge base. Held in process for a minute: the widget is on
 * every public page, the set is small, and the database is a region away.
 */
async function activeIntents(): Promise<MatchableIntent[]> {
  const cached = readMemo<MatchableIntent[]>(MEMO_KEY);
  if (cached) return cached;

  const rows = await prisma.chatIntent.findMany({
    where: { isActive: true },
    select: {
      id: true,
      question: true,
      patterns: true,
      answer: true,
      actionLabel: true,
      actionUrl: true,
    },
  });
  const value: MatchableIntent[] = rows.map((r) => ({
    id: r.id,
    question: r.question,
    patterns: toPatterns(r.patterns),
    answer: r.answer,
    actionLabel: r.actionLabel,
    actionUrl: r.actionUrl,
  }));
  writeMemo(MEMO_KEY, value, TTL_MS);
  return value;
}

export interface ChatReply {
  answer: string;
  matched: boolean;
  intentId: string | null;
  action: { label: string; url: string } | null;
  /** Offered when nothing matched — the nearest things Ami does know. */
  suggestions: { id: string; question: string }[];
}

export interface ChatGreeting {
  enabled: boolean;
  name: string;
  greeting: string;
  suggestions: { id: string; question: string }[];
}

/** What the widget shows before anyone has typed. */
export async function getChatGreeting(): Promise<ChatGreeting> {
  const [{ settings }, suggested] = await Promise.all([
    getSettings(),
    prisma.chatIntent.findMany({
      where: { isActive: true, isSuggested: true },
      orderBy: { hits: "desc" },
      take: 6,
      select: { id: true, question: true },
    }),
  ]);

  return {
    enabled: settings.chatbotEnabled,
    name: settings.chatbotName,
    greeting: settings.chatbotGreeting,
    suggestions: suggested,
  };
}

/** Answer one question, and record both halves of the exchange. */
export async function askAmi(input: {
  question: string;
  sessionId: string;
  userId?: string | null;
}): Promise<ChatReply> {
  const question = input.question.trim().slice(0, 500);
  if (!question) throw AppError.badRequest("Ask me something.");

  const intents = await activeIntents();
  const match = findBestMatch(question, intents);

  // The visitor's line is stored either way — an unmatched one is the queue.
  await prisma.chatMessage.create({
    data: {
      sessionId: input.sessionId.slice(0, 64),
      userId: input.userId ?? null,
      role: "user",
      text: question,
      intentId: match?.intent.id ?? null,
      matched: match != null,
    },
  });

  if (!match) {
    const { settings } = await getSettings();
    const near = nearMisses(question, intents);
    const answer =
      near.length > 0
        ? `I'm not sure about that one yet — I've passed it to the team. Meanwhile, I can help with any of these:`
        : `I'm not sure about that one yet, so I've passed it to the team. You can also call the office and someone will get straight back to you.`;

    await prisma.chatMessage.create({
      data: {
        sessionId: input.sessionId.slice(0, 64),
        userId: input.userId ?? null,
        role: "bot",
        text: answer,
        matched: true,
      },
    });

    return {
      answer,
      matched: false,
      intentId: null,
      action: settings.chatbotEnabled
        ? { label: "Talk to a counsellor", url: "/contact" }
        : null,
      suggestions: near.map((n) => ({ id: n.id, question: n.question })),
    };
  }

  const { intent } = match;

  // Two independent writes, neither of which the reply waits on separately.
  await Promise.all([
    prisma.chatMessage.create({
      data: {
        sessionId: input.sessionId.slice(0, 64),
        userId: input.userId ?? null,
        role: "bot",
        text: intent.answer,
        intentId: intent.id,
        matched: true,
      },
    }),
    // Raw counter bump: `chatIntent.update` is fine here (few relations), but
    // updateMany skips the read-back the widget has no use for.
    prisma.chatIntent.updateMany({
      where: { id: intent.id },
      data: { hits: { increment: 1 } },
    }),
  ]);

  return {
    answer: intent.answer,
    matched: true,
    intentId: intent.id,
    action:
      intent.actionLabel && intent.actionUrl
        ? { label: intent.actionLabel, url: intent.actionUrl }
        : null,
    suggestions: [],
  };
}

// ── Admin side ───────────────────────────────────────────────────────────────

export interface AdminIntent {
  id: string;
  question: string;
  patterns: string[];
  answer: string;
  actionLabel: string | null;
  actionUrl: string | null;
  category: string | null;
  isSuggested: boolean;
  isActive: boolean;
  hits: number;
  updatedAt: string;
}

export interface UnansweredQuestion {
  id: string;
  text: string;
  askedAt: string;
  /** How many times this exact question has come up unanswered. */
  count: number;
  userName: string | null;
}

export interface ChatbotBoard {
  intents: AdminIntent[];
  unanswered: UnansweredQuestion[];
  stats: { intents: number; active: number; answered: number; unanswered: number };
}

export async function getChatbotBoard(): Promise<ChatbotBoard> {
  const [rows, unmatched, answered, unansweredCount] = await Promise.all([
    prisma.chatIntent.findMany({ orderBy: [{ hits: "desc" }, { updatedAt: "desc" }] }),
    prisma.chatMessage.findMany({
      where: { role: "user", matched: false, resolved: false },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        text: true,
        createdAt: true,
        user: { select: { name: true } },
      },
    }),
    prisma.chatMessage.count({ where: { role: "user", matched: true } }),
    prisma.chatMessage.count({ where: { role: "user", matched: false, resolved: false } }),
  ]);

  // Collapse repeats so the queue is a list of *questions*, not of askings.
  const byText = new Map<string, UnansweredQuestion>();
  for (const m of unmatched) {
    const key = m.text.trim().toLowerCase();
    const existing = byText.get(key);
    if (existing) {
      existing.count += 1;
      continue;
    }
    byText.set(key, {
      id: m.id,
      text: m.text,
      askedAt: m.createdAt.toISOString(),
      count: 1,
      userName: m.user?.name ?? null,
    });
  }

  return {
    intents: rows.map((r) => ({
      id: r.id,
      question: r.question,
      patterns: toPatterns(r.patterns),
      answer: r.answer,
      actionLabel: r.actionLabel,
      actionUrl: r.actionUrl,
      category: r.category,
      isSuggested: r.isSuggested,
      isActive: r.isActive,
      hits: r.hits,
      updatedAt: r.updatedAt.toISOString(),
    })),
    unanswered: [...byText.values()],
    stats: {
      intents: rows.length,
      active: rows.filter((r) => r.isActive).length,
      answered,
      unanswered: unansweredCount,
    },
  };
}

export async function createIntent(input: ChatIntentInput): Promise<string> {
  const row = await prisma.chatIntent.create({
    data: {
      question: input.question,
      patterns: input.patterns,
      answer: input.answer,
      actionLabel: input.actionLabel || null,
      actionUrl: input.actionUrl || null,
      category: input.category || null,
      isSuggested: input.isSuggested,
      isActive: input.isActive,
    },
    select: { id: true },
  });
  invalidateChatbot();
  return row.id;
}

export async function updateIntent(id: string, input: ChatIntentInput): Promise<void> {
  const existing = await prisma.chatIntent.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw AppError.notFound("That answer no longer exists.");
  await prisma.chatIntent.update({
    where: { id },
    data: {
      question: input.question,
      patterns: input.patterns,
      answer: input.answer,
      actionLabel: input.actionLabel || null,
      actionUrl: input.actionUrl || null,
      category: input.category || null,
      isSuggested: input.isSuggested,
      isActive: input.isActive,
    },
  });
  invalidateChatbot();
}

export async function deleteIntent(id: string): Promise<void> {
  // The transcript keeps its rows; only the pointer goes, so an old
  // conversation still reads back correctly.
  await prisma.chatMessage.updateMany({ where: { intentId: id }, data: { intentId: null } });
  await prisma.chatIntent.deleteMany({ where: { id } });
  invalidateChatbot();
}

/**
 * Clear a question out of the "teach Ami" queue without answering it — for the
 * nonsense and the one-offs. Every asking of the same question goes at once,
 * which is why the queue is keyed on the text rather than the row.
 */
export async function dismissUnanswered(id: string): Promise<void> {
  const row = await prisma.chatMessage.findUnique({
    where: { id },
    select: { text: true },
  });
  if (!row) return;
  await prisma.chatMessage.updateMany({
    where: { role: "user", matched: false, text: row.text },
    data: { resolved: true },
  });
}

/** Mark every asking of these questions as dealt with — used after teaching one. */
export async function resolveUnanswered(texts: string[]): Promise<void> {
  if (texts.length === 0) return;
  await prisma.chatMessage.updateMany({
    where: { role: "user", matched: false, text: { in: texts } },
    data: { resolved: true },
  });
}

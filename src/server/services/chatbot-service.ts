import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/api/errors";
import { getSettings } from "./settings-service";
import { readMemo, writeMemo, clearMemo } from "./memo";
import {
  findBestMatch,
  nearMisses,
  type MatchableIntent,
} from "@/lib/chatbot/match";
import {
  CHAT_INTENT_CSV_COLUMNS,
  PATTERN_SEPARATOR,
  type ChatIntentInput,
  type ChatSurface,
  type ImportIntentsInput,
} from "@/lib/validations/chatbot";
import { createLead } from "./lead-service";
import { notifyStaff } from "./notification-service";
import { sendMail } from "@/lib/mail/mailer";
import { env } from "@/lib/env";
import { answerFromKnowledge, searchKnowledge } from "./chat-knowledge-service";

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
  return raw.filter(
    (p): p is string => typeof p === "string" && p.trim().length > 0,
  );
}

/**
 * The active knowledge base. Held in process for a minute: the widget is on
 * every public page, the set is small, and the database is a region away.
 */
/** An answer, with the two things that decide who may be given it. */
type ScopedIntent = MatchableIntent & {
  audience: "PUBLIC" | "INTERNAL" | "BOTH";
  roles: string[];
};

async function activeIntents(): Promise<ScopedIntent[]> {
  const cached = readMemo<ScopedIntent[]>(MEMO_KEY);
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
      audience: true,
      roles: true,
    },
  });
  const value: ScopedIntent[] = rows.map((r) => ({
    id: r.id,
    question: r.question,
    patterns: toPatterns(r.patterns),
    answer: r.answer,
    actionLabel: r.actionLabel,
    actionUrl: r.actionUrl,
    audience: r.audience,
    roles: toPatterns(r.roles),
  }));
  writeMemo(MEMO_KEY, value, TTL_MS);
  return value;
}

/**
 * The answers this asker may be given.
 *
 * Outside, only the public set — "external chatbot answers preaddmision answers
 * only". Inside, the internal set as well, narrowed to the roles each answer
 * was written for, so a learner is never handed an answer meant for staff.
 */
function intentsFor(
  all: ScopedIntent[],
  surface: ChatSurface,
  roles: string[],
): ScopedIntent[] {
  if (surface === "public") {
    return all.filter((i) => i.audience === "PUBLIC" || i.audience === "BOTH");
  }
  return all.filter((i) => {
    if (i.audience === "PUBLIC") return false;
    if (i.roles.length === 0) return true;
    return i.roles.some((r) => roles.includes(r));
  });
}

/** Every role slug a person holds — their own, plus any extra ones. */
async function rolesOf(userId: string | null | undefined): Promise<string[]> {
  if (!userId) return [];
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: { select: { slug: true } },
      extraRoles: { select: { role: { select: { slug: true } } } },
    },
  });
  if (!user) return [];
  return [user.role?.slug, ...user.extraRoles.map((r) => r.role.slug)].filter(
    (s): s is string => Boolean(s),
  );
}

/**
 * What the widget should do with an answer's button.
 *
 * `link` opens a page; `counsellor` is handled inside the chat, because the
 * academy asked that a signed-in learner never be sent off to fill in a form
 * with details the panel already holds.
 */
export type ChatActionKind = "link" | "counsellor";

export interface ChatReply {
  answer: string;
  matched: boolean;
  intentId: string | null;
  action: { label: string; url: string; kind: ChatActionKind } | null;
  /** Offered when nothing matched — the nearest things Ami does know. */
  suggestions: { id: string; question: string }[];
}

export interface ChatGreeting {
  enabled: boolean;
  name: string;
  greeting: string;
  suggestions: { id: string; question: string }[];
  /**
   * Who is asking, when the panel knows. The widget uses it to skip the "what
   * is your name and number" step for someone already signed in.
   */
  viewer: {
    signedIn: boolean;
    name: string | null;
    email: string | null;
    phone: string | null;
  };
}

/** What the widget shows before anyone has typed. */
export async function getChatGreeting(
  userId?: string | null,
): Promise<ChatGreeting> {
  const [{ settings }, suggested, viewer] = await Promise.all([
    getSettings(),
    prisma.chatIntent.findMany({
      where: { isActive: true, isSuggested: true },
      orderBy: { hits: "desc" },
      take: 6,
      select: { id: true, question: true },
    }),
    userId
      ? prisma.user.findUnique({
          where: { id: userId },
          select: { name: true, email: true, phone: true },
        })
      : Promise.resolve(null),
  ]);

  return {
    enabled: settings.chatbotEnabled,
    name: settings.chatbotName,
    greeting: settings.chatbotGreeting,
    suggestions: suggested,
    viewer: {
      signedIn: Boolean(viewer),
      name: viewer?.name ?? null,
      email: viewer?.email ?? null,
      phone: viewer?.phone ?? null,
    },
  };
}

/** Answer one question, and record both halves of the exchange. */
export async function askAmi(input: {
  question: string;
  sessionId: string;
  userId?: string | null;
  /** Which assistant is being talked to. Defaults to the website one. */
  surface?: ChatSurface;
  /** The page open at the time, so an answer can be about what they see. */
  screen?: string | null;
}): Promise<ChatReply> {
  const question = input.question.trim().slice(0, 500);
  if (!question) throw AppError.badRequest("Ask me something.");

  const surface: ChatSurface =
    input.userId && input.surface === "panel" ? "panel" : "public";
  const sessionId = input.sessionId.slice(0, 64);
  const screen = (input.screen ?? "").slice(0, 160) || null;

  const [all, roles] = await Promise.all([
    activeIntents(),
    rolesOf(input.userId),
  ]);
  const intents = intentsFor(all, surface, roles);
  const match = findBestMatch(question, intents);

  // The visitor's line is stored either way — an unmatched one is the queue.
  await prisma.chatMessage.create({
    data: {
      sessionId,
      userId: input.userId ?? null,
      role: "user",
      text: question,
      intentId: match?.intent.id ?? null,
      matched: match != null,
      surface,
      screen,
    },
  });

  // Whatever the conversation gave away about who is having it. Awaited, not
  // left floating: a serverless function stops when it answers, and a promise
  // still in flight goes with it.
  await noteAbstract({
    sessionId,
    userId: input.userId ?? null,
    question,
    surface,
  });

  if (!match) {
    // Inside a panel there is a second place to look: the learner's own
    // reading, papers and assignments — "internal chatbot picks our notes,
    // quiz and assignments to answer educational questions".
    if (surface === "panel" && input.userId) {
      const hits = await searchKnowledge({
        question,
        userId: input.userId,
        screen,
        take: 3,
      });
      if (hits.length > 0) {
        const answer = answerFromKnowledge(hits);
        await prisma.chatMessage.create({
          data: {
            sessionId,
            userId: input.userId,
            role: "bot",
            text: answer,
            matched: true,
            surface,
            screen,
          },
        });
        return {
          answer,
          matched: true,
          intentId: null,
          action: {
            label: `Open ${hits[0].title}`,
            url: hits[0].url,
            kind: "link" as const,
          },
          suggestions: [],
        };
      }
    }

    const { settings } = await getSettings();
    const near = nearMisses(question, intents);
    const answer =
      near.length > 0
        ? `I'm not sure about that one yet — I've passed it to the team. Meanwhile, I can help with any of these:`
        : surface === "panel"
          ? `I'm not sure about that one yet, so I've passed it to your instructor. They'll add it to the course notes.`
          : `I'm not sure about that one yet, so I've passed it to the team. You can also call the office and someone will get straight back to you.`;

    await prisma.chatMessage.create({
      data: {
        sessionId,
        userId: input.userId ?? null,
        role: "bot",
        text: answer,
        matched: true,
        surface,
        screen,
      },
    });

    return {
      answer,
      matched: false,
      intentId: null,
      // Only the website assistant offers to put someone through to admissions;
      // inside a panel there is nothing to sell.
      action:
        settings.chatbotEnabled && surface === "public"
          ? {
              label: "Talk to a counsellor",
              url: "/contact",
              kind: "counsellor" as const,
            }
          : null,
      suggestions: near.map((n) => ({ id: n.id, question: n.question })),
    };
  }

  const { intent } = match;

  // Two independent writes, neither of which the reply waits on separately.
  await Promise.all([
    prisma.chatMessage.create({
      data: {
        sessionId,
        userId: input.userId ?? null,
        role: "bot",
        text: intent.answer,
        intentId: intent.id,
        matched: true,
        surface,
        screen,
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
        ? {
            label: intent.actionLabel,
            url: intent.actionUrl,
            kind: "link" as const,
          }
        : null,
    suggestions: [],
  };
}

// ── The abstract ─────────────────────────────────────────────────────────────

const COURSE_MEMO_KEY = "chatbot:course-keys";

/** Words that say nothing about which course somebody means. */
const TITLE_NOISE =
  /\b(advanced|basic|complete|professional|certified|certificate|course|courses|program|programme|training|classes|class|batch|with|and|for|the|in|of|students?|business|owners?|beginners?|20\d\d)\b/gi;

/**
 * The phrase a person would actually use for a course.
 *
 * Titles on the catalogue read like "Advanced Digital Marketing Course For
 * Students and Business Owners, 2026", and nobody types that — they type
 * "digital marketing". So each course is reduced to what is distinctive about
 * it, and the category it sits under is offered as a key of its own.
 */
function courseKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/[,.()[\]/|–—-]+/g, " ")
    .replace(TITLE_NOISE, " ")
    .replace(/\s+/g, " ")
    .trim();
}

interface CourseKey {
  /** What to look for in the message. */
  key: string;
  /** What to file against the conversation — the real name. */
  title: string;
}

/**
 * The published courses and their categories as searchable phrases, held for a
 * few minutes. Every message is checked against them and the list barely
 * changes between terms.
 */
async function courseKeys(): Promise<CourseKey[]> {
  const cached = readMemo<CourseKey[]>(COURSE_MEMO_KEY);
  if (cached) return cached;

  const [courses, categories] = await Promise.all([
    prisma.course.findMany({
      where: { status: "PUBLISHED" },
      select: { title: true, category: { select: { name: true } } },
      take: 200,
    }),
    prisma.category.findMany({ select: { name: true }, take: 100 }),
  ]);

  const keys: CourseKey[] = [];
  for (const c of courses) {
    keys.push({ key: c.title.toLowerCase(), title: c.title });
    const short = courseKey(c.title);
    if (short.length >= 5) keys.push({ key: short, title: c.title });
    // People name a course by its first couple of words — "spoken english" for
    // "Spoken English With Personality Development" — so that is a key too.
    const words = short.split(" ").filter(Boolean);
    if (words.length > 2) {
      const lead = words.slice(0, 2).join(" ");
      if (lead.length >= 6) keys.push({ key: lead, title: c.title });
    }
    if (c.category?.name) {
      keys.push({ key: c.category.name.toLowerCase(), title: c.category.name });
    }
  }
  for (const cat of categories) {
    keys.push({ key: cat.name.toLowerCase(), title: cat.name });
  }

  // Longest first, so "advanced data analysis" is preferred over "data".
  const unique = [...new Map(keys.map((k) => [k.key, k])).values()]
    .filter((k) => k.key.length >= 5)
    .sort((a, b) => b.key.length - a.key.length);

  writeMemo(COURSE_MEMO_KEY, unique, 5 * 60_000);
  return unique;
}

const PHONE_RE = /(?:\+?91[\s-]?)?([6-9]\d{9})\b/;
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]{2,}/;
const NAME_RE =
  /\b(?:my name is|i am|i'm|this is|myself)\s+([\p{L}][\p{L}\s.'-]{1,48})/iu;

/**
 * Pick the useful details out of what somebody typed.
 *
 * "It also detects basic details coming in the chat and updates this in a
 * different section named abstract." Nothing here is clever: a phone number, an
 * email, a name offered in the ordinary way, and a course the academy actually
 * runs. What it finds is written to one row per conversation, which the office
 * works from under Assistant → Abstract.
 */
export async function noteAbstract(input: {
  sessionId: string;
  userId: string | null;
  question: string;
  surface: ChatSurface;
}): Promise<void> {
  try {
    const text = input.question;
    const phone = text.match(PHONE_RE)?.[1] ?? null;
    const email = text.match(EMAIL_RE)?.[0] ?? null;
    const name = text.match(NAME_RE)?.[1]?.trim().replace(/\s+/g, " ") ?? null;

    // A course only counts when the academy runs one somebody could mean.
    const keys = await courseKeys();
    const lower = text.toLowerCase();
    const courseInterest =
      keys.find((k) => lower.includes(k.key))?.title ?? null;

    const existing = await prisma.chatAbstract.findFirst({
      where: { sessionId: input.sessionId },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        courseInterest: true,
      },
    });

    // Only ever fills blanks: the first number somebody gives is the one the
    // office should ring, not whatever was typed last.
    const data = {
      userId: input.userId,
      surface: input.surface,
      lastQuestion: text.slice(0, 1000),
      ...(name && !existing?.name ? { name } : {}),
      ...(phone && !existing?.phone ? { phone } : {}),
      ...(email && !existing?.email ? { email } : {}),
      ...(courseInterest && !existing?.courseInterest
        ? { courseInterest }
        : {}),
    };

    if (existing) {
      await prisma.chatAbstract.update({
        where: { id: existing.id },
        data: { ...data, messageCount: { increment: 1 } },
      });
    } else {
      await prisma.chatAbstract.create({
        data: { ...data, sessionId: input.sessionId, messageCount: 1 },
      });
    }
  } catch {
    // The abstract is a convenience. A conversation must never fail because
    // a detail could not be filed.
  }
}

/**
 * "Put me through to a person."
 *
 * The academy's rule: "Chatbot should not ask for details if user is already
 * logged in. Else should ask details to connect with human counsellor." So a
 * signed-in learner's request carries their account across untouched, and only
 * a stranger is asked who they are. Either way it lands on the lead sheet,
 * which is where the office works from, and the staff notice comes with it.
 */
export async function requestCounsellor(input: {
  userId?: string | null;
  name?: string;
  phone?: string;
  email?: string;
  /** Which programme they were asking about, so the counsellor opens knowing. */
  courseInterest?: string;
  note?: string;
  sessionId?: string;
}): Promise<{ name: string; phone: string; leadId: string }> {
  const account = input.userId
    ? await prisma.user.findUnique({
        where: { id: input.userId },
        select: { name: true, email: true, phone: true },
      })
    : null;

  const name = (input.name?.trim() || account?.name || "").slice(0, 80);
  // A learner whose account has no number still has to give one — the office
  // rings people; it cannot ring an email address.
  const phone = (input.phone?.trim() || account?.phone || "").slice(0, 20);
  const email = (input.email?.trim() || account?.email || "").slice(0, 120);

  if (!name)
    throw AppError.badRequest("Tell me your name and I'll pass it on.");
  if (phone.replace(/\D/g, "").length < 6) {
    throw AppError.badRequest(
      "I need a phone number the office can call you on.",
    );
  }

  // The last thing they asked, so the counsellor opens the conversation knowing
  // what it is about.
  const recent = input.sessionId
    ? await prisma.chatMessage.findFirst({
        where: { sessionId: input.sessionId.slice(0, 64), role: "user" },
        orderBy: { createdAt: "desc" },
        select: { text: true },
      })
    : null;

  const message = [
    input.note?.trim(),
    recent?.text ? `Asked Ami: “${recent.text}”` : null,
    account ? "Requested from their own panel while signed in." : null,
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 2000);

  // What they said they were interested in, or what the conversation gave away.
  const abstract = input.sessionId
    ? await prisma.chatAbstract.findFirst({
        where: { sessionId: input.sessionId.slice(0, 64) },
        select: { id: true, courseInterest: true },
      })
    : null;
  const courseInterest = (
    input.courseInterest?.trim() ||
    abstract?.courseInterest ||
    ""
  ).slice(0, 120);

  const leadId = await createLead(
    {
      name,
      phone,
      email: email || "",
      courseInterest,
      message: message || "Asked to speak to a counsellor from the assistant.",
    },
    "WEBSITE",
  );

  // The office was not hearing about these — "m not receiving live agent
  // requests now, previously I was getting requests but not receiving now".
  // `createLead` raises an in-panel notice; somebody who is not looking at the
  // panel needs the email, and the email needs to carry the three things they
  // asked for by name: "a detail name, number and interested course".
  await notifyCounsellorRequest({
    name,
    phone,
    email,
    courseInterest,
    leadId,
    note: message,
  });

  if (abstract) {
    await prisma.chatAbstract.update({
      where: { id: abstract.id },
      data: { leadId, name, phone, ...(email ? { email } : {}) },
    });
  }

  return { name, phone, leadId };
}

/**
 * Tell the office somebody is waiting to be called — in the panel and by email.
 *
 * Addressed to whoever Settings names for enquiries, falling back to the
 * academy's own address, so turning it on is a settings change rather than a
 * deploy. A mail server that is down must not lose the lead, which is already
 * saved by the time this runs.
 */
async function notifyCounsellorRequest(input: {
  name: string;
  phone: string;
  email: string;
  courseInterest: string;
  leadId: string;
  note: string;
}): Promise<void> {
  const line = [
    input.name,
    input.phone,
    input.email || null,
    input.courseInterest || null,
  ]
    .filter(Boolean)
    .join(" · ");

  await notifyStaff({
    type: "SYSTEM",
    title: "Live agent requested",
    message: `${line} — asked to be connected from the assistant.`,
    actionUrl: `/admin/leads?lead=${input.leadId}`,
  });

  const { settings } = await getSettings();
  const to = settings.supportEmail || env.SMTP_FROM_EMAIL || env.SMTP_USER;
  if (!to) return;

  const rows = [
    ["Name", input.name],
    ["Phone", input.phone],
    ["Email", input.email || "—"],
    ["Interested in", input.courseInterest || "—"],
    ["What they asked", input.note || "—"],
  ]
    .map(
      ([k, v]) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#666">${k}</td><td style="padding:4px 0"><strong>${v}</strong></td></tr>`,
    )
    .join("");

  try {
    await sendMail({
      to,
      subject: `Live agent requested — ${input.name} (${input.phone})`,
      html: `
      <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;color:#111">
        <h2 style="color:#e11d48">Someone wants to talk to a counsellor</h2>
        <table style="font-size:14px;border-collapse:collapse">${rows}</table>
        <p style="margin:20px 0">
          <a href="${env.NEXT_PUBLIC_APP_URL}/admin/leads?lead=${input.leadId}"
             style="background:#e11d48;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">
            Open the lead
          </a>
        </p>
        <p style="color:#666;font-size:13px">Sent by the site assistant.</p>
      </div>`,
      text: `Live agent requested.\n${line}\nAsked: ${input.note || "—"}\n${env.NEXT_PUBLIC_APP_URL}/admin/leads?lead=${input.leadId}`,
    });
  } catch {
    // The lead is saved; a mail failure must not fail the request the visitor
    // made, and the in-panel notice has already gone out.
  }
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
  /** Which assistant may give it — "PUBLIC" | "INTERNAL" | "BOTH". */
  audience: string;
  /** Role slugs it is written for; empty means anyone signed in. */
  roles: string[];
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
  /** Which assistant was asked, so the two queues can be told apart. */
  surface: string;
  /** The page open at the time, when there was one. */
  screen: string | null;
}

export interface ChatbotBoard {
  intents: AdminIntent[];
  unanswered: UnansweredQuestion[];
  stats: {
    intents: number;
    active: number;
    answered: number;
    unanswered: number;
  };
}

export async function getChatbotBoard(): Promise<ChatbotBoard> {
  const [rows, unmatched, answered, unansweredCount] = await Promise.all([
    prisma.chatIntent.findMany({
      orderBy: [{ hits: "desc" }, { updatedAt: "desc" }],
    }),
    prisma.chatMessage.findMany({
      where: { role: "user", matched: false, resolved: false },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        text: true,
        createdAt: true,
        surface: true,
        screen: true,
        user: { select: { name: true } },
      },
    }),
    prisma.chatMessage.count({ where: { role: "user", matched: true } }),
    prisma.chatMessage.count({
      where: { role: "user", matched: false, resolved: false },
    }),
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
      surface: m.surface,
      screen: m.screen,
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
      audience: r.audience,
      roles: toPatterns(r.roles),
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

// ── Training sheet ──────────────────────────────────────────────────────

/** Every answer Ami knows, in the columns the importer reads back. */
export async function intentsForExport(): Promise<{
  headers: string[];
  data: (string | number)[][];
}> {
  const rows = await prisma.chatIntent.findMany({
    orderBy: [{ category: "asc" }, { question: "asc" }],
  });
  return {
    headers: [...CHAT_INTENT_CSV_COLUMNS],
    data: rows.map((r) => [
      r.question,
      toPatterns(r.patterns).join(` ${PATTERN_SEPARATOR} `),
      r.answer,
      r.category ?? "",
      r.actionLabel ?? "",
      r.actionUrl ?? "",
      r.isSuggested ? "Yes" : "No",
      r.isActive ? "Yes" : "No",
      r.audience,
      toPatterns(r.roles).join(` ${PATTERN_SEPARATOR} `),
    ]),
  };
}

export interface ImportIntentsResult {
  imported: number;
  updated: number;
  skipped: number;
  errors: { row: number; message: string }[];
  message: string;
}

const YES = new Set(["yes", "y", "true", "1", "active", "on"]);
const NO = new Set(["no", "n", "false", "0", "inactive", "off"]);

/** A blank cell keeps whatever the column already meant. */
/**
 * Read an audience out of a spreadsheet cell. People write "internal", "panel",
 * "website", "both" — all of which mean something obvious — so the sheet is not
 * made to speak in enum constants.
 */
function audienceOf(value: string, fallback: "PUBLIC" | "INTERNAL" | "BOTH") {
  const v = value.trim().toLowerCase();
  if (!v) return fallback;
  if (v.startsWith("int") || v.startsWith("pan") || v.startsWith("ins"))
    return "INTERNAL";
  if (v.startsWith("bot") || v.startsWith("all")) return "BOTH";
  if (v.startsWith("pub") || v.startsWith("web") || v.startsWith("ext"))
    return "PUBLIC";
  return fallback;
}

function flag(value: string, fallback: boolean): boolean {
  const v = value.trim().toLowerCase();
  if (YES.has(v)) return true;
  if (NO.has(v)) return false;
  return fallback;
}

/**
 * Teach Ami from a spreadsheet.
 *
 * Matching is on the question, case- and space-insensitively: re-importing an
 * edited export updates those answers rather than doubling them, which is what
 * makes export → edit → import a safe round trip. A bad row is reported and
 * skipped so the rest of a mostly-good sheet still lands.
 */
export async function importIntents(
  input: ImportIntentsInput,
): Promise<ImportIntentsResult> {
  const existing = await prisma.chatIntent.findMany({
    select: {
      id: true,
      question: true,
      isSuggested: true,
      isActive: true,
      audience: true,
    },
  });
  const key = (v: string) => v.trim().toLowerCase().replace(/\s+/g, " ");
  const byQuestion = new Map(existing.map((r) => [key(r.question), r]));

  const errors: { row: number; message: string }[] = [];
  let imported = 0;
  let updated = 0;
  let skipped = 0;

  for (const [i, row] of input.rows.entries()) {
    // Row 1 is the header in the file the person is looking at.
    const lineNo = i + 2;
    const question = row.question.trim();
    const answer = row.answer.trim();

    if (!question || !answer) {
      skipped += 1;
      errors.push({
        row: lineNo,
        message: !question
          ? "No question in that row."
          : `"${question}" has no answer.`,
      });
      continue;
    }

    const patterns = row.patterns
      .split(/[|\n]/)
      .map((p) => p.trim())
      .filter(Boolean)
      .slice(0, 25);

    const roles = row.roles
      .split(/[|,\n]/)
      .map((r) => r.trim().toUpperCase())
      .filter(Boolean)
      .slice(0, 12);

    const data = {
      question,
      patterns,
      answer,
      category: row.category.trim() || null,
      actionLabel: row.actionLabel.trim() || null,
      actionUrl: row.actionUrl.trim() || null,
      roles,
    };

    try {
      const hit = byQuestion.get(key(question));
      if (hit) {
        await prisma.chatIntent.update({
          where: { id: hit.id },
          data: {
            ...data,
            isSuggested: flag(row.isSuggested, hit.isSuggested),
            isActive: flag(row.isActive, hit.isActive),
            audience: audienceOf(row.audience, hit.audience),
          },
        });
        updated += 1;
      } else {
        const created = await prisma.chatIntent.create({
          data: {
            ...data,
            isSuggested: flag(row.isSuggested, false),
            // A new answer goes live unless the sheet says otherwise.
            isActive: flag(row.isActive, true),
            // …and belongs to the website assistant, which is where an
            // imported FAQ almost always belongs.
            audience: audienceOf(row.audience, "PUBLIC"),
          },
          select: {
            id: true,
            question: true,
            isSuggested: true,
            isActive: true,
            audience: true,
          },
        });
        // Guard against a sheet that lists the same question twice — the second
        // one edits the first rather than creating a duplicate.
        byQuestion.set(key(question), created);
        imported += 1;
      }
    } catch {
      skipped += 1;
      errors.push({ row: lineNo, message: `Couldn't save "${question}".` });
    }
  }

  if (imported + updated > 0) invalidateChatbot();

  const parts = [];
  if (imported) parts.push(`${imported} new`);
  if (updated) parts.push(`${updated} updated`);
  if (skipped) parts.push(`${skipped} skipped`);
  return {
    imported,
    updated,
    skipped,
    errors: errors.slice(0, 50),
    message: parts.length
      ? `Ami has learnt: ${parts.join(", ")}.`
      : "Nothing to import.",
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
      audience: input.audience,
      roles: input.roles,
    },
    select: { id: true },
  });
  invalidateChatbot();
  return row.id;
}

export async function updateIntent(
  id: string,
  input: ChatIntentInput,
): Promise<void> {
  const existing = await prisma.chatIntent.findUnique({
    where: { id },
    select: { id: true },
  });
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
      audience: input.audience,
      roles: input.roles,
    },
  });
  invalidateChatbot();
}

export async function deleteIntent(id: string): Promise<void> {
  // The transcript keeps its rows; only the pointer goes, so an old
  // conversation still reads back correctly.
  await prisma.chatMessage.updateMany({
    where: { intentId: id },
    data: { intentId: null },
  });
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

// ── Abstract ─────────────────────────────────────────────────────────────────

export interface AbstractRow {
  id: string;
  sessionId: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  courseInterest: string | null;
  lastQuestion: string | null;
  messageCount: number;
  surface: string;
  /** Set once somebody has turned this into a lead. */
  leadId: string | null;
  userName: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * What the conversations gave away, newest first.
 *
 * Only rows that actually say something are listed: a chat that never mentioned
 * a name, a number, an email or a course is a chat, not a lead, and the office
 * has the transcript for those.
 */
export async function listAbstracts(
  opts: { take?: number } = {},
): Promise<AbstractRow[]> {
  const rows = await prisma.chatAbstract.findMany({
    where: {
      dismissed: false,
      OR: [
        { name: { not: null } },
        { phone: { not: null } },
        { email: { not: null } },
        { courseInterest: { not: null } },
      ],
    },
    orderBy: { updatedAt: "desc" },
    take: Math.min(200, opts.take ?? 100),
    include: { user: { select: { name: true } } },
  });

  return rows.map((r) => ({
    id: r.id,
    sessionId: r.sessionId,
    name: r.name,
    phone: r.phone,
    email: r.email,
    courseInterest: r.courseInterest,
    lastQuestion: r.lastQuestion,
    messageCount: r.messageCount,
    surface: r.surface,
    leadId: r.leadId,
    userName: r.user?.name ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));
}

/** Everything said in one conversation, for reading beside the abstract. */
export async function abstractTranscript(
  sessionId: string,
): Promise<{ id: string; role: string; text: string; createdAt: string }[]> {
  const rows = await prisma.chatMessage.findMany({
    where: { sessionId: sessionId.slice(0, 64) },
    orderBy: { createdAt: "asc" },
    take: 200,
    select: { id: true, role: true, text: true, createdAt: true },
  });
  return rows.map((r) => ({
    id: r.id,
    role: r.role,
    text: r.text,
    createdAt: r.createdAt.toISOString(),
  }));
}

/** Put one on the lead sheet, where the office actually works. */
export async function abstractToLead(id: string): Promise<string> {
  const row = await prisma.chatAbstract.findUnique({ where: { id } });
  if (!row) throw AppError.notFound("That conversation is no longer here.");
  if (row.leadId) return row.leadId;
  if (!row.name && !row.phone) {
    throw AppError.badRequest(
      "There's no name or number in that conversation yet.",
    );
  }

  const leadId = await createLead(
    {
      name: row.name || "Website visitor",
      phone: row.phone || "",
      email: row.email || "",
      courseInterest: row.courseInterest || "",
      message: row.lastQuestion
        ? `From the assistant. Last asked: “${row.lastQuestion}”`
        : "Picked up from a conversation with the assistant.",
    },
    "WEBSITE",
  );
  await prisma.chatAbstract.update({ where: { id }, data: { leadId } });
  return leadId;
}

/** Take one off the list without creating anything. */
export async function dismissAbstract(id: string): Promise<void> {
  await prisma.chatAbstract.updateMany({
    where: { id },
    data: { dismissed: true },
  });
}

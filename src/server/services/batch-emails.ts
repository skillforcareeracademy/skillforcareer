import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { env } from "@/lib/env";
import { sendMail } from "@/lib/mail/mailer";
import { emailLayout } from "@/lib/mail/templates/layout";
import { notify } from "./notification-service";

/**
 * "No mail received when we add student in batch."
 *
 * Adding a learner to a batch used to leave only a bell notification, which a
 * walk-in who has never signed in will not see. This sends each of them an
 * email with what they actually need on day one — which batch, which course,
 * when it starts, the days and time, who teaches it, and where the live
 * classes are — plus the in-app notification.
 *
 * Nothing here may fail the add itself: the learner is already on the batch
 * by the time this runs, so every error is caught and logged.
 */

const APP_URL = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");

/** How many emails go out at once. The SMTP pool holds three connections. */
const SEND_CONCURRENCY = 3;

const DAY_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** "19:00" → "7:00 PM". Wall-clock strings, so no Date and no timezone. */
function clock(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm;
  const suffix = h < 12 ? "AM" : "PM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** "Mon, Wed, Fri · 7:00 PM – 9:00 PM", or null when no timetable is set. */
function scheduleLine(json: unknown): string | null {
  if (!json || typeof json !== "object" || Array.isArray(json)) return null;
  const o = json as Record<string, unknown>;
  const days = Array.isArray(o.days)
    ? (o.days.filter((d) => typeof d === "string") as string[]).sort(
        (a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b),
      )
    : [];
  const start = typeof o.startTime === "string" ? o.startTime : "";
  const end = typeof o.endTime === "string" ? o.endTime : "";
  const hours =
    start && end
      ? `${clock(start)} – ${clock(end)}`
      : start
        ? clock(start)
        : "";
  const line = [days.join(", "), hours].filter(Boolean).join(" · ");
  return line || null;
}

/**
 * Batch dates are calendar days stored at UTC midnight, so they are formatted
 * in UTC — formatting in IST would be harmless, but anywhere west of Greenwich
 * would print the day before.
 */
function calendarDay(d: Date): string {
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

interface BatchFacts {
  name: string;
  code: string;
  courseTitle: string;
  courseSlug: string;
  startDate: Date | null;
  schedule: string | null;
  teachers: string[];
}

function addedEmail(learnerName: string, b: BatchFacts) {
  const first = learnerName.trim().split(/\s+/)[0] || "there";
  const rows: [string, string][] = [
    ["Batch", `${b.name} (${b.code})`],
    ["Course", b.courseTitle],
  ];
  if (b.startDate) rows.push(["Starts on", calendarDay(b.startDate)]);
  if (b.schedule) rows.push(["Class days & time", b.schedule]);
  if (b.teachers.length) {
    rows.push([
      b.teachers.length > 1 ? "Instructors" : "Instructor",
      b.teachers.join(", "),
    ]);
  }

  const table = rows
    .map(
      ([k, v]) => `
      <tr>
        <td style="padding:8px 0;font-size:13px;color:#71717a;width:42%;vertical-align:top;">${esc(k)}</td>
        <td style="padding:8px 0;font-size:14px;color:#18181b;font-weight:600;">${esc(v)}</td>
      </tr>`,
    )
    .join("");

  const liveUrl = `${APP_URL}/student/live`;
  const courseUrl = `${APP_URL}/student/learn/${encodeURIComponent(b.courseSlug)}`;

  const bodyHtml = `
    <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#3f3f46;">
      Hi ${esc(first)}, you've been added to a batch at Skill For Career. Here are your class details:
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;border-top:1px solid #f4f4f5;border-bottom:1px solid #f4f4f5;">
      ${table}
    </table>
    <p style="margin:0 0 20px;">
      <a href="${liveUrl}" style="display:inline-block;background:#e11d48;color:#ffffff;padding:11px 20px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">
        See your live classes
      </a>
    </p>
    <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#71717a;">
      Your course material is waiting at <a href="${courseUrl}" style="color:#e11d48;">${esc(b.courseTitle)}</a>.
      To sign in, enter this email address and we'll send you a one-time code — no password needed.
    </p>`;

  const text = [
    `Hi ${first}, you've been added to a batch at Skill For Career.`,
    "",
    ...rows.map(([k, v]) => `${k}: ${v}`),
    "",
    `Your live classes: ${liveUrl}`,
    `Your course: ${courseUrl}`,
    "Sign in with this email address — we'll send you a one-time code.",
  ].join("\n");

  return {
    subject: `You're in: ${b.name}`,
    html: emailLayout({
      heading: "Welcome to your batch",
      bodyHtml,
      previewText: `${b.courseTitle}${b.startDate ? ` · starts ${calendarDay(b.startDate)}` : ""}`,
    }),
    text,
  };
}

/**
 * Tell learners they have been put on a batch: one email each plus an in-app
 * notification. Never throws.
 */
export async function notifyAddedToBatch(
  batchId: string,
  userIds: string[],
): Promise<void> {
  const ids = [...new Set(userIds)].filter(Boolean);
  if (ids.length === 0) return;

  try {
    const [batch, associates, users] = await Promise.all([
      prisma.batch.findUnique({
        where: { id: batchId },
        select: {
          name: true,
          code: true,
          startDate: true,
          schedule: true,
          course: { select: { title: true, slug: true } },
          instructor: { select: { name: true } },
        },
      }),
      prisma.batchInstructor.findMany({
        where: { batchId },
        orderBy: { createdAt: "asc" },
        select: { user: { select: { name: true } } },
      }),
      prisma.user.findMany({
        where: { id: { in: ids }, status: { not: "SUSPENDED" } },
        select: { id: true, name: true, email: true },
      }),
    ]);
    if (!batch) return;

    await notify({
      userIds: users.map((u) => u.id),
      type: "COURSE",
      title: "You've been added to a batch",
      message: `You're now on “${batch.name}” for ${batch.course.title}.`,
      actionUrl: "/student/live",
    });

    const facts: BatchFacts = {
      name: batch.name,
      code: batch.code,
      courseTitle: batch.course.title,
      courseSlug: batch.course.slug,
      startDate: batch.startDate,
      schedule: scheduleLine(batch.schedule),
      teachers: [
        ...(batch.instructor ? [batch.instructor.name] : []),
        ...associates.map((a) => a.user.name),
      ].filter((n, i, all) => all.indexOf(n) === i),
    };

    // A few at a time: the pool only holds three connections, and a whole
    // imported roster fired at once would just queue inside nodemailer.
    let sent = 0;
    for (let i = 0; i < users.length; i += SEND_CONCURRENCY) {
      const results = await Promise.all(
        users.slice(i, i + SEND_CONCURRENCY).map((u) => {
          const mail = addedEmail(u.name, facts);
          return sendMail({ to: u.email, ...mail });
        }),
      );
      sent += results.filter(Boolean).length;
    }
    logger.info("batch.added_emails", {
      batchId,
      learners: users.length,
      sent,
    });
  } catch (error) {
    logger.error("batch.added_emails_failed", {
      batchId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Run `notifyAddedToBatch` once the response has gone out, so a large import
 * isn't held open while the emails send. Outside a request (a script) there is
 * no `after`, and it simply runs in the background instead.
 */
export function queueAddedToBatch(batchId: string, userIds: string[]): void {
  if (userIds.length === 0) return;
  const run = () => notifyAddedToBatch(batchId, userIds);
  try {
    after(run);
  } catch {
    void run();
  }
}

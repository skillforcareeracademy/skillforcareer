import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { notify } from "./notification-service";
import { sendMail } from "@/lib/mail/mailer";
import { AppError } from "@/lib/api/errors";
import { env } from "@/lib/env";
import { getSettings } from "./settings-service";
import {
  accruePenalties,
  penaltyStartsOn,
  refreshFeeStatus,
  termsFor,
  DAY_MS,
} from "./fee-plan-service";

/**
 * Payment reminders — nudges a learner about money still owed.
 *
 * The academy set the cadence itself: "Regular reminders of payment 7 days
 * before, 3 days before, 1 day before and 2 hours ago reminder for pending
 * payment. Still payment not paid after due date, email to clear dues asap as
 * penalty has been getting charged."
 *
 * So each instalment has five nudges in its life, each sent at most once. The
 * stage that has gone out is written on the row, which is what makes a re-run
 * of the sweep — or a cron that fires twice — harmless.
 */

const num = (d: Prisma.Decimal) => d.toNumber();
const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;
const APP_URL = env.NEXT_PUBLIC_APP_URL;

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * The five moments a learner hears from us about one instalment, newest first
 * so the sweep always picks the closest one that is due to be sent.
 */
export const REMINDER_STAGES = [
  { key: "overdue", label: "after the due date", offsetMs: null },
  { key: "2h", label: "in about 2 hours", offsetMs: 2 * 3_600_000 },
  { key: "1d", label: "tomorrow", offsetMs: DAY_MS },
  { key: "3d", label: "in 3 days", offsetMs: 3 * DAY_MS },
  { key: "7d", label: "in 7 days", offsetMs: 7 * DAY_MS },
] as const;

type StageKey = (typeof REMINDER_STAGES)[number]["key"];

const sentStages = (value: string | null | undefined): Set<string> =>
  new Set((value ?? "").split(",").filter(Boolean));

const withStage = (value: string | null | undefined, stage: string): string =>
  [...sentStages(value).add(stage)].join(",").slice(0, 60);

/**
 * Which nudge, if any, is owed for a due date right now. Returns null when the
 * date is still further off than the first reminder, or when the right nudge
 * has already gone out.
 */
export function stageDueFor(
  dueDate: Date,
  already: Set<string>,
  now = Date.now(),
): (typeof REMINDER_STAGES)[number] | null {
  const until = dueDate.getTime() - now;
  for (const stage of REMINDER_STAGES) {
    const reached =
      stage.offsetMs == null ? until < 0 : until <= stage.offsetMs;
    if (reached && !already.has(stage.key)) return stage;
    // Passing a stage that was already sent is normal; passing one that is not
    // yet reached means none of the later ones can be either.
    if (reached) return null;
  }
  return null;
}

function reminderEmail(input: {
  name: string;
  amount: string;
  courseTitle: string | null;
  dueLabel: string;
  invoice: string;
  overdue: boolean;
  penalty: string | null;
}): { subject: string; html: string; text: string } {
  const forCourse = input.courseTitle
    ? ` for <strong>${input.courseTitle}</strong>`
    : "";
  const subject = input.overdue
    ? `Payment overdue · ${input.amount}`
    : `Payment reminder · ${input.amount} due`;

  // The overdue note says what it is going to cost, because that is the whole
  // reason for sending it: "email to clear dues asap as penalty has been
  // getting charged. Or talk to skill for career team."
  const body = input.overdue
    ? `<p>Our records show <strong>${input.amount}</strong>${forCourse} is past its due date.</p>
       ${input.penalty ? `<p>A late fee of <strong>${input.penalty}</strong> has been added. Clearing the balance stops any further charge.</p>` : ""}
       <p>If you have already paid, or you would like to talk through your options, reply to this email or call the Skill For Career team and we will sort it out with you.</p>`
    : `<p>This is a friendly reminder that <strong>${input.amount}</strong>${forCourse} is due ${input.dueLabel}.</p>`;

  const html = `
  <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;color:#111">
    <h2 style="color:#e11d48">${input.overdue ? "Payment overdue" : "Payment reminder"}</h2>
    <p>Hi ${input.name},</p>
    ${body}
    <p style="margin:20px 0">
      <a href="${APP_URL}/student/payments"
         style="background:#e11d48;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">
        View &amp; pay
      </a>
    </p>
    <p style="color:#666;font-size:13px">Invoice ${input.invoice}. If you've already paid, please ignore this message.</p>
    <p style="color:#666;font-size:13px">— SkillForCareer</p>
  </div>`;

  const text = input.overdue
    ? `Hi ${input.name}, ${input.amount}${input.courseTitle ? ` for ${input.courseTitle}` : ""} is past its due date${input.penalty ? `, and a late fee of ${input.penalty} has been added` : ""}. Pay at ${APP_URL}/student/payments or talk to the Skill For Career team (Invoice ${input.invoice}).`
    : `Hi ${input.name}, a reminder that ${input.amount}${input.courseTitle ? ` for ${input.courseTitle}` : ""} is due ${input.dueLabel}. Pay at ${APP_URL}/student/payments (Invoice ${input.invoice}).`;

  return { subject, html, text };
}

interface Outstanding {
  amount: number;
  dueLabel: string;
  overdue: boolean;
  penalty: number;
  installmentId: string | null;
}

type PaymentWithPlan = {
  id: string;
  userId: string;
  invoiceNumber: string;
  status: string;
  type: string;
  netAmount: Prisma.Decimal;
  penaltyWaived: boolean;
  graceDays: number | null;
  penaltyPercent: Prisma.Decimal | null;
  penaltyFlat: Prisma.Decimal | null;
  remindedStages: string | null;
  user: { name: string; email: string };
  course: { title: string } | null;
  installments: {
    id: string;
    installmentNo: number;
    amount: Prisma.Decimal;
    dueDate: Date;
    status: string;
    paidAmount: Prisma.Decimal;
    penaltyAmount: Prisma.Decimal;
    penaltyWaived: boolean;
    remindedStages: string | null;
  }[];
};

/** What's still owed on a payment right now — or null if nothing is. */
function outstanding(payment: PaymentWithPlan): Outstanding | null {
  const next = payment.installments
    .filter((i) => i.status !== "PAID" && i.status !== "CANCELLED")
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())[0];

  if (next) {
    const owing = Math.max(0, num(next.amount) - num(next.paidAmount));
    const overdue = next.dueDate.getTime() < Date.now();
    const penalty =
      payment.penaltyWaived || next.penaltyWaived ? 0 : num(next.penaltyAmount);
    return {
      amount: owing,
      overdue,
      penalty,
      dueLabel: overdue
        ? `overdue (instalment #${next.installmentNo}, was due ${fmtDate(next.dueDate)})`
        : `due ${fmtDate(next.dueDate)} (instalment #${next.installmentNo})`,
      installmentId: next.id,
    };
  }

  if (
    payment.status === "PENDING" ||
    payment.status === "PROCESSING" ||
    payment.status === "DUE"
  ) {
    return {
      amount: num(payment.netAmount),
      overdue: false,
      penalty: 0,
      dueLabel: "still pending",
      installmentId: null,
    };
  }
  return null;
}

async function deliver(
  payment: PaymentWithPlan,
  due: Outstanding,
  stage: StageKey | null,
): Promise<void> {
  const amount = inr(due.amount);
  await notify({
    userIds: [payment.userId],
    type: "PAYMENT",
    title: due.overdue ? "Payment overdue" : "Payment reminder",
    message: `${amount}${payment.course ? ` for “${payment.course.title}”` : ""} is ${due.dueLabel}.${due.penalty > 0 ? ` A late fee of ${inr(due.penalty)} has been added.` : ""} Invoice ${payment.invoiceNumber}.`,
    actionUrl: "/student/payments",
  });

  const mail = reminderEmail({
    name: payment.user.name,
    amount,
    courseTitle: payment.course?.title ?? null,
    dueLabel: due.dueLabel,
    invoice: payment.invoiceNumber,
    overdue: due.overdue,
    penalty: due.penalty > 0 ? inr(due.penalty) : null,
  });
  await sendMail({ to: payment.user.email, ...mail });

  const now = new Date();
  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      lastRemindedAt: now,
      ...(stage
        ? { remindedStages: withStage(payment.remindedStages, stage) }
        : {}),
    },
  });
  if (due.installmentId) {
    const row = payment.installments.find((i) => i.id === due.installmentId);
    await prisma.installment.update({
      where: { id: due.installmentId },
      data: {
        lastRemindedAt: now,
        ...(stage
          ? { remindedStages: withStage(row?.remindedStages, stage) }
          : {}),
      },
    });
  }
}

const PLAN_INCLUDE = {
  user: { select: { name: true, email: true } },
  course: { select: { title: true } },
  installments: { orderBy: { installmentNo: "asc" } },
} satisfies Prisma.PaymentInclude;

/** Admin-initiated reminder for a single payment. Always sends. */
export async function remindPayment(paymentId: string): Promise<void> {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: PLAN_INCLUDE,
  });
  if (!payment) throw AppError.notFound("Payment not found.");

  const due = outstanding(payment);
  if (!due)
    throw AppError.badRequest("Nothing is outstanding on this payment.");

  await deliver(payment, due, null);
}

export interface ReminderRunResult {
  overdueMarked: number;
  penaltiesCharged: number;
  reminded: number;
  statusesRefreshed: number;
}

/**
 * The scheduled sweep: charge what is late, nudge what is near, and bring every
 * plan's status in line with what it actually owes.
 *
 * Each plan gets at most one message per run and at most one per stage ever, so
 * a cron that fires hourly costs nothing and a cron that fires twice sends once.
 */
export async function runPaymentReminders(): Promise<ReminderRunResult> {
  const now = new Date();
  const { settings } = await getSettings();
  const LIMIT = 200;

  // 1) Anything past its date is overdue, and anything past its grace period
  //    has earned a late fee.
  const { count: overdueMarked } = await prisma.installment.updateMany({
    where: { status: "SCHEDULED", dueDate: { lt: now } },
    data: { status: "OVERDUE" },
  });
  const penaltiesCharged = await accruePenalties();

  if (!settings.feeRemindersEnabled) {
    const refreshed = await refreshDuePlans(LIMIT);
    return {
      overdueMarked,
      penaltiesCharged,
      reminded: 0,
      statusesRefreshed: refreshed,
    };
  }

  // 2) Plans with something still owing, near or past their date. The earliest
  //    nudge is seven days out, so nothing further off is worth reading.
  const horizon = new Date(now.getTime() + 7 * DAY_MS);
  const plans = await prisma.payment.findMany({
    where: {
      status: {
        notIn: ["REFUNDED", "PARTIALLY_REFUNDED", "DISCONTINUED", "NO_DUE"],
      },
      OR: [
        {
          installments: {
            some: {
              status: { in: ["SCHEDULED", "OVERDUE"] },
              dueDate: { lte: horizon },
            },
          },
        },
        {
          installments: { none: {} },
          status: { in: ["PENDING", "PROCESSING", "DUE"] },
          createdAt: { lt: new Date(now.getTime() - DAY_MS) },
        },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: LIMIT,
    include: PLAN_INCLUDE,
  });

  let reminded = 0;
  for (const plan of plans) {
    const due = outstanding(plan);
    if (!due || due.amount <= 0) continue;

    const next = plan.installments
      .filter((i) => i.status !== "PAID" && i.status !== "CANCELLED")
      .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())[0];

    if (next) {
      // An overdue plan is chased from the end of its grace period, not from
      // the due date — the office gave the learner those days on purpose.
      const terms = await termsFor(plan);
      const already = sentStages(next.remindedStages);
      const stage = stageDueFor(next.dueDate, already, now.getTime());
      if (!stage) continue;
      if (
        stage.key === "overdue" &&
        now < penaltyStartsOn(next.dueDate, terms.graceDays)
      ) {
        continue;
      }
      await deliver(plan, due, stage.key);
    } else {
      // A one-off with nothing scheduled: one nudge, then leave them alone.
      if (sentStages(plan.remindedStages).has("overdue")) continue;
      await deliver(plan, due, "overdue");
    }
    reminded += 1;
  }

  const statusesRefreshed = await refreshDuePlans(LIMIT);
  return { overdueMarked, penaltiesCharged, reminded, statusesRefreshed };
}

/**
 * Bring statuses back in line — "after status should be automatically update as
 * per condition". Only plans that could have moved are read.
 */
async function refreshDuePlans(limit: number): Promise<number> {
  const ids = await prisma.payment.findMany({
    where: {
      status: { in: ["DUE", "DEFAULTED", "NO_DUE", "PAID"] },
      installments: { some: {} },
    },
    orderBy: { updatedAt: "asc" },
    take: limit,
    select: { id: true },
  });
  for (const { id } of ids) await refreshFeeStatus(id);
  return ids.length;
}

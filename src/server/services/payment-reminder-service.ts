import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { notify } from "./notification-service";
import { sendMail } from "@/lib/mail/mailer";
import { AppError } from "@/lib/api/errors";
import { env } from "@/lib/env";

/**
 * Payment reminders — nudges a learner about money still owed. Two entry points:
 * `remindPayment` (an admin clicks "Send reminder") and `runPaymentReminders`
 * (a scheduled sweep). Both go out in-app AND by email, and both stamp
 * `lastRemindedAt` so the sweep never spams.
 */

const num = (d: Prisma.Decimal) => d.toNumber();
const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;
const APP_URL = env.NEXT_PUBLIC_APP_URL;
const DAY = 86_400_000;

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function reminderEmail(input: {
  name: string;
  amount: string;
  courseTitle: string | null;
  dueLabel: string;
  invoice: string;
}): { subject: string; html: string; text: string } {
  const forCourse = input.courseTitle ? ` for <strong>${input.courseTitle}</strong>` : "";
  const subject = `Payment reminder · ${input.amount} due`;
  const html = `
  <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;color:#111">
    <h2 style="color:#e11d48">Payment reminder</h2>
    <p>Hi ${input.name},</p>
    <p>This is a friendly reminder that <strong>${input.amount}</strong>${forCourse} is ${input.dueLabel.toLowerCase()}.</p>
    <p style="margin:20px 0">
      <a href="${APP_URL}/student/profile"
         style="background:#e11d48;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">
        View & pay
      </a>
    </p>
    <p style="color:#666;font-size:13px">Invoice ${input.invoice}. If you've already paid, please ignore this message.</p>
    <p style="color:#666;font-size:13px">— SkillForCareer</p>
  </div>`;
  const text = `Hi ${input.name}, a reminder that ${input.amount}${input.courseTitle ? ` for ${input.courseTitle}` : ""} is ${input.dueLabel.toLowerCase()}. Pay at ${APP_URL}/student/profile (Invoice ${input.invoice}).`;
  return { subject, html, text };
}

interface Outstanding {
  amount: number;
  dueLabel: string;
  installmentId: string | null;
}

/** What's still owed on a payment right now — or null if nothing is. */
function outstanding(payment: {
  status: string;
  type: string;
  netAmount: Prisma.Decimal;
  installments: { id: string; installmentNo: number; amount: Prisma.Decimal; dueDate: Date; status: string }[];
}): Outstanding | null {
  if (payment.type === "EMI" && payment.installments.length > 0) {
    const next = payment.installments
      .filter((i) => i.status !== "PAID" && i.status !== "CANCELLED")
      .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())[0];
    if (!next) return null;
    const overdue = next.dueDate.getTime() < Date.now();
    return {
      amount: num(next.amount),
      dueLabel: overdue
        ? `overdue (installment #${next.installmentNo}, was due ${fmtDate(next.dueDate)})`
        : `due ${fmtDate(next.dueDate)} (installment #${next.installmentNo})`,
      installmentId: next.id,
    };
  }
  if (payment.status === "PENDING" || payment.status === "PROCESSING" || payment.status === "FAILED") {
    return { amount: num(payment.netAmount), dueLabel: "still pending", installmentId: null };
  }
  return null;
}

async function deliver(
  payment: {
    id: string;
    userId: string;
    invoiceNumber: string;
    user: { name: string; email: string };
    course: { title: string } | null;
  },
  due: Outstanding,
): Promise<void> {
  const amount = inr(due.amount);
  await notify({
    userIds: [payment.userId],
    type: "PAYMENT",
    title: "Payment reminder",
    message: `${amount}${payment.course ? ` for “${payment.course.title}”` : ""} is ${due.dueLabel}. Invoice ${payment.invoiceNumber}.`,
    actionUrl: "/student/profile",
  });
  const mail = reminderEmail({
    name: payment.user.name,
    amount,
    courseTitle: payment.course?.title ?? null,
    dueLabel: due.dueLabel,
    invoice: payment.invoiceNumber,
  });
  await sendMail({ to: payment.user.email, ...mail });

  const now = new Date();
  await prisma.payment.update({ where: { id: payment.id }, data: { lastRemindedAt: now } });
  if (due.installmentId) {
    await prisma.installment.update({ where: { id: due.installmentId }, data: { lastRemindedAt: now } });
  }
}

/** Admin-initiated reminder for a single payment. */
export async function remindPayment(paymentId: string): Promise<void> {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      user: { select: { name: true, email: true } },
      course: { select: { title: true } },
      installments: { orderBy: { installmentNo: "asc" } },
    },
  });
  if (!payment) throw AppError.notFound("Payment not found.");

  const due = outstanding(payment);
  if (!due) throw AppError.badRequest("Nothing is outstanding on this payment.");

  await deliver(payment, due);
}

export interface ReminderRunResult {
  overdueMarked: number;
  installmentsReminded: number;
  paymentsReminded: number;
}

/**
 * Scheduled sweep: mark newly-overdue installments, then remind on anything due
 * soon or overdue — throttled to once every ~20h per item so repeated runs (or a
 * misbehaving cron) can't spam a learner.
 */
export async function runPaymentReminders(): Promise<ReminderRunResult> {
  const now = new Date();
  const soon = new Date(now.getTime() + 3 * DAY);
  const throttle = new Date(now.getTime() - 20 * 3_600_000);
  const LIMIT = 200;

  // 1) Flip past-due scheduled installments to OVERDUE.
  const { count: overdueMarked } = await prisma.installment.updateMany({
    where: { status: "SCHEDULED", dueDate: { lt: now } },
    data: { status: "OVERDUE" },
  });

  // 2) EMI installments due soon / overdue and not recently reminded.
  const dueInstallments = await prisma.installment.findMany({
    where: {
      status: { in: ["SCHEDULED", "OVERDUE"] },
      dueDate: { lte: soon },
      OR: [{ lastRemindedAt: null }, { lastRemindedAt: { lt: throttle } }],
      payment: { status: { notIn: ["REFUNDED", "PARTIALLY_REFUNDED"] } },
    },
    orderBy: { dueDate: "asc" },
    take: LIMIT,
    include: {
      payment: {
        include: {
          user: { select: { name: true, email: true } },
          course: { select: { title: true } },
          installments: { orderBy: { installmentNo: "asc" } },
        },
      },
    },
  });

  let installmentsReminded = 0;
  const remindedPaymentIds = new Set<string>();
  for (const i of dueInstallments) {
    if (remindedPaymentIds.has(i.paymentId)) continue; // one nudge per payment per run
    const due = outstanding(i.payment);
    if (!due) continue;
    await deliver(i.payment, due);
    remindedPaymentIds.add(i.paymentId);
    installmentsReminded += 1;
  }

  // 3) Plain pending payments older than a day, not recently reminded.
  const pending = await prisma.payment.findMany({
    where: {
      status: { in: ["PENDING", "PROCESSING"] },
      type: { not: "EMI" },
      createdAt: { lt: new Date(now.getTime() - DAY) },
      OR: [{ lastRemindedAt: null }, { lastRemindedAt: { lt: throttle } }],
    },
    orderBy: { createdAt: "asc" },
    take: LIMIT,
    include: {
      user: { select: { name: true, email: true } },
      course: { select: { title: true } },
      installments: true,
    },
  });

  let paymentsReminded = 0;
  for (const p of pending) {
    const due = outstanding(p);
    if (!due) continue;
    await deliver(p, due);
    paymentsReminded += 1;
  }

  return { overdueMarked, installmentsReminded, paymentsReminded };
}

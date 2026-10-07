import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { getSettings } from "./settings-service";
import type { InstallmentMode } from "@/lib/validations/payment";

/**
 * The arithmetic behind a learner's fee plan: how an instalment schedule is
 * laid out, what a late one is charged, and which of the academy's own statuses
 * follows from the two.
 *
 * It lives apart from `payment-service` because none of it touches Razorpay,
 * enrolment or invoices — it is the office's ledger, and the reminder sweep,
 * the admin screens and the learner's Fees page all need the same answers.
 */

const num = (d: Prisma.Decimal) => d.toNumber();
const money = (n: number) => Math.round(n * 100) / 100;
export const DAY_MS = 86_400_000;

/** A date typed into a form, or nothing. Never throws on a bad string. */
export function readDate(value: string | null | undefined): Date | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export interface FeeTerms {
  graceDays: number;
  penaltyPercent: number;
  penaltyFlat: number;
}

/**
 * The terms this plan runs on: its own where it has them, the platform's
 * otherwise. A plan stores a term only when the office gave this learner
 * something different, so changing the default moves everyone else with it.
 */
export async function termsFor(payment: {
  graceDays: number | null;
  penaltyPercent: Prisma.Decimal | null;
  penaltyFlat: Prisma.Decimal | null;
}): Promise<FeeTerms> {
  const { settings } = await getSettings();
  return {
    graceDays: payment.graceDays ?? settings.feeGraceDays,
    penaltyPercent: payment.penaltyPercent
      ? num(payment.penaltyPercent)
      : settings.feePenaltyPercent,
    penaltyFlat: payment.penaltyFlat
      ? num(payment.penaltyFlat)
      : settings.feePenaltyFlat,
  };
}

/** The day an instalment stops being merely late and starts costing extra. */
export function penaltyStartsOn(dueDate: Date, graceDays: number): Date {
  return new Date(dueDate.getTime() + graceDays * DAY_MS);
}

/**
 * What a late instalment owes on top, by the plan's terms. A flat figure wins
 * over the percentage when the office has set one — "we can also edit that
 * penalty percentage or amount".
 */
export function penaltyFor(outstanding: number, terms: FeeTerms): number {
  if (outstanding <= 0) return 0;
  if (terms.penaltyFlat > 0) return money(terms.penaltyFlat);
  return money((outstanding * terms.penaltyPercent) / 100);
}

export interface ScheduleRow {
  installmentNo: number;
  amount: number;
  dueDate: Date;
}

/**
 * Lay out a schedule.
 *
 * AUTO spreads `count` instalments evenly between two dates — "automatic
 * calculate next installments from this date to that date" — and falls back to
 * one a month when only the first date is given. The last instalment absorbs
 * the rounding remainder so the parts always add back up to the whole.
 */
export function buildSchedule(input: {
  total: number;
  count: number;
  from: Date;
  to?: Date | null;
}): ScheduleRow[] {
  const count = Math.max(1, Math.floor(input.count));
  const per = Math.floor((input.total / count) * 100) / 100;

  // Even spacing between the two ends; a single instalment just sits on `from`.
  const span =
    input.to && count > 1
      ? (input.to.getTime() - input.from.getTime()) / (count - 1)
      : null;

  return Array.from({ length: count }, (_, i) => {
    let dueDate: Date;
    if (span != null && span > 0) {
      dueDate = new Date(input.from.getTime() + span * i);
    } else {
      dueDate = new Date(input.from);
      dueDate.setMonth(dueDate.getMonth() + i);
    }
    return {
      installmentNo: i + 1,
      amount: i === count - 1 ? money(input.total - per * (count - 1)) : per,
      dueDate,
    };
  });
}

/** A schedule written out by hand, sorted and numbered. */
export function normaliseSchedule(
  rows: { amount: number; dueDate: string }[],
): ScheduleRow[] {
  return rows
    .map((r) => ({ amount: money(r.amount), dueDate: readDate(r.dueDate) }))
    .filter((r): r is { amount: number; dueDate: Date } => r.dueDate != null)
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())
    .map((r, i) => ({
      installmentNo: i + 1,
      amount: r.amount,
      dueDate: r.dueDate,
    }));
}

/**
 * Work out the rows for a plan from whatever the form sent, or null when there
 * is nothing to schedule (a one-off payment, or a plan with no dates yet).
 */
export function scheduleFromInput(input: {
  mode: InstallmentMode;
  total: number;
  count?: number;
  from?: string | null;
  to?: string | null;
  manual?: { amount: number; dueDate: string }[];
}): ScheduleRow[] | null {
  if (input.mode === "MANUAL") {
    const rows = normaliseSchedule(input.manual ?? []);
    return rows.length > 0 ? rows : null;
  }
  const count = input.count ?? 0;
  if (count < 2) return null;
  const from = readDate(input.from) ?? nextMonth();
  return buildSchedule({
    total: input.total,
    count,
    from,
    to: readDate(input.to),
  });
}

function nextMonth(): Date {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  return d;
}

/** Replace a plan's schedule wholesale, keeping what has already been paid. */
export async function writeSchedule(
  paymentId: string,
  rows: ScheduleRow[],
): Promise<void> {
  const existing = await prisma.installment.findMany({
    where: { paymentId },
    orderBy: { installmentNo: "asc" },
    select: {
      id: true,
      installmentNo: true,
      status: true,
      paidAt: true,
      paidAmount: true,
      method: true,
      penaltyAmount: true,
      penaltyWaived: true,
    },
  });

  // A rewritten schedule must not lose money already recorded against it, so
  // anything paid carries its payment across onto the row with the same number.
  const paidByNo = new Map(
    existing
      .filter((i) => i.status === "PAID" || num(i.paidAmount) > 0)
      .map((i) => [i.installmentNo, i]),
  );

  await prisma.installment.deleteMany({ where: { paymentId } });
  if (rows.length === 0) return;

  await prisma.installment.createMany({
    data: rows.map((r) => {
      const was = paidByNo.get(r.installmentNo);
      return {
        paymentId,
        installmentNo: r.installmentNo,
        amount: new Prisma.Decimal(r.amount),
        dueDate: r.dueDate,
        status: was?.status ?? ("SCHEDULED" as const),
        paidAt: was?.paidAt ?? null,
        paidAmount: was?.paidAmount ?? new Prisma.Decimal(0),
        method: was?.method ?? null,
        penaltyAmount: was?.penaltyAmount ?? new Prisma.Decimal(0),
        penaltyWaived: was?.penaltyWaived ?? false,
      };
    }),
  });
}

export interface FeeSummary {
  /** What the plan is for in total, instalments and interest included. */
  payable: number;
  paid: number;
  penalty: number;
  outstanding: number;
  /** The next thing owed, if anything is. */
  nextDueDate: Date | null;
  nextDueAmount: number;
  /** How late the oldest unpaid instalment is, past its grace period. */
  daysLate: number;
  status: "NO_DUE" | "DUE" | "DEFAULTED";
}

type PaymentForSummary = {
  status: string;
  type: string;
  netAmount: Prisma.Decimal;
  paidAt: Date | null;
  graceDays: number | null;
  penaltyPercent: Prisma.Decimal | null;
  penaltyFlat: Prisma.Decimal | null;
  penaltyWaived: boolean;
  installments: {
    amount: Prisma.Decimal;
    dueDate: Date;
    status: string;
    paidAmount: Prisma.Decimal;
    penaltyAmount: Prisma.Decimal;
    penaltyWaived: boolean;
  }[];
};

/**
 * Where a plan stands right now: what is owed, what it has cost in late fees,
 * and which of the three live statuses that adds up to. Everything the office
 * sees about money owing is read from here, so one rule decides it.
 */
export async function summarise(
  payment: PaymentForSummary,
): Promise<FeeSummary> {
  const terms = await termsFor(payment);
  const now = Date.now();

  if (payment.installments.length === 0) {
    // No schedule: the whole net amount is either in or it isn't.
    const settled = payment.status === "PAID" || payment.status === "NO_DUE";
    const payable = num(payment.netAmount);
    return {
      payable,
      paid: settled ? payable : 0,
      penalty: 0,
      outstanding: settled ? 0 : payable,
      nextDueDate: settled ? null : payment.paidAt,
      nextDueAmount: settled ? 0 : payable,
      daysLate: 0,
      status: settled ? "NO_DUE" : "DUE",
    };
  }

  let payable = 0;
  let paid = 0;
  let penalty = 0;
  let daysLate = 0;
  let nextDueDate: Date | null = null;
  let nextDueAmount = 0;

  for (const i of payment.installments) {
    if (i.status === "CANCELLED") continue;
    const amount = num(i.amount);
    const got =
      i.status === "PAID" ? amount : Math.min(amount, num(i.paidAmount));
    payable += amount;
    paid += got;

    const owing = money(amount - got);
    if (owing <= 0) continue;

    if (nextDueDate == null || i.dueDate < nextDueDate) {
      nextDueDate = i.dueDate;
      nextDueAmount = owing;
    }

    const chargeableFrom = penaltyStartsOn(i.dueDate, terms.graceDays);
    if (now > chargeableFrom.getTime()) {
      daysLate = Math.max(
        daysLate,
        Math.floor((now - chargeableFrom.getTime()) / DAY_MS),
      );
      if (!payment.penaltyWaived && !i.penaltyWaived) {
        // The stored figure is what has been charged; falling back to a fresh
        // calculation means a plan shows its late fee the moment it is late,
        // without waiting for the nightly sweep to write it down.
        penalty += num(i.penaltyAmount) || penaltyFor(owing, terms);
      }
    }
  }

  const outstanding = money(Math.max(0, payable - paid) + penalty);
  const status: FeeSummary["status"] =
    outstanding <= 0 ? "NO_DUE" : daysLate > 0 ? "DEFAULTED" : "DUE";

  return {
    payable: money(payable),
    paid: money(paid),
    penalty: money(penalty),
    outstanding,
    nextDueDate,
    nextDueAmount,
    daysLate,
    status,
  };
}

const SUMMARY_SELECT = {
  status: true,
  type: true,
  netAmount: true,
  paidAt: true,
  graceDays: true,
  penaltyPercent: true,
  penaltyFlat: true,
  penaltyWaived: true,
  installments: {
    orderBy: { installmentNo: "asc" },
    select: {
      amount: true,
      dueDate: true,
      status: true,
      paidAmount: true,
      penaltyAmount: true,
      penaltyWaived: true,
    },
  },
} satisfies Prisma.PaymentSelect;

/**
 * Bring a payment's status in line with what is actually owed — "after status
 * should be automatically update as per condition".
 *
 * The states the office sets by hand are left alone: a refund, a failure or a
 * discontinued course all say something no arithmetic can work out, and a plan
 * still waiting on Razorpay belongs to the gateway.
 */
const MANUAL_STATUSES = [
  "REFUNDED",
  "PARTIALLY_REFUNDED",
  "FAILED",
  "DISCONTINUED",
  "PENDING",
  "PROCESSING",
] as const satisfies readonly Prisma.PaymentWhereInput["status"][] &
  readonly string[];

export async function refreshFeeStatus(paymentId: string): Promise<void> {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    select: {
      ...SUMMARY_SELECT,
      id: true,
      firstPaymentAt: true,
      lastPaymentAt: true,
    },
  });
  if (
    !payment ||
    (MANUAL_STATUSES as readonly string[]).includes(payment.status)
  )
    return;

  const summary = await summarise(payment);

  // The ends of the trail follow what has actually been paid, unless the office
  // has pinned them by hand — "fetch automatically from payment trail… we can
  // change it manually also", so a value already set is never overwritten.
  const paidRows = await prisma.installment.findMany({
    where: { paymentId, status: "PAID", paidAt: { not: null } },
    orderBy: { paidAt: "asc" },
    select: { paidAt: true },
  });

  const data: Prisma.PaymentUncheckedUpdateInput = {};
  // A fully-paid plan is still "paid"; the office's NO_DUE says the same thing
  // in its own words, and keeping PAID would hide a plan from the fee screens.
  if (payment.status !== summary.status) data.status = summary.status;
  if (payment.firstPaymentAt == null && paidRows[0]?.paidAt) {
    data.firstPaymentAt = paidRows[0].paidAt;
  }
  if (payment.lastPaymentAt == null && paidRows.at(-1)?.paidAt) {
    data.lastPaymentAt = paidRows.at(-1)!.paidAt;
  }
  if (Object.keys(data).length === 0) return;

  await prisma.payment.update({ where: { id: paymentId }, data });
}

/** The same summary, read straight from an id. */
export async function feeSummaryFor(
  paymentId: string,
): Promise<FeeSummary | null> {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    select: SUMMARY_SELECT,
  });
  return payment ? summarise(payment) : null;
}

/**
 * Write down the late fee on every instalment that has earned one. Run by the
 * reminder sweep, so the figure the office sees is the figure the learner was
 * told about rather than one that drifts with the clock.
 */
export async function accruePenalties(): Promise<number> {
  const { settings } = await getSettings();
  // Nothing is charged while the academy has late fees switched off, and
  // switching them on must not reach back over dues that were already settled
  // off the books — which is how a learner came to be billed for an instalment
  // the office had taken in cash.
  if (!settings.feeRemindersEnabled) return 0;

  const now = new Date();
  const candidates = await prisma.installment.findMany({
    where: {
      status: { in: ["SCHEDULED", "OVERDUE"] },
      penaltyWaived: false,
      penaltyAmount: 0,
      dueDate: { lt: now },
      payment: {
        penaltyWaived: false,
        status: { notIn: [...MANUAL_STATUSES] },
      },
    },
    take: 500,
    include: {
      payment: {
        select: { graceDays: true, penaltyPercent: true, penaltyFlat: true },
      },
    },
  });

  let charged = 0;
  for (const i of candidates) {
    const terms = await termsFor(i.payment);
    if (now <= penaltyStartsOn(i.dueDate, terms.graceDays)) continue;
    const owing = money(num(i.amount) - num(i.paidAmount));
    const penalty = penaltyFor(owing, terms);
    if (penalty <= 0) continue;
    await prisma.installment.update({
      where: { id: i.id },
      data: { penaltyAmount: new Prisma.Decimal(penalty), status: "OVERDUE" },
    });
    charged += 1;
  }
  return charged;
}

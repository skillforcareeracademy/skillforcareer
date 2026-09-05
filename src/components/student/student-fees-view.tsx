"use client";

import { format } from "date-fns";
import {
  AlertCircle,
  ArrowUpRight,
  BadgeIndianRupee,
  CalendarClock,
  CheckCircle2,
  Clock,
  CreditCard,
  Percent,
  Receipt,
  Wallet,
} from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { StatCard } from "@/components/dashboard/stat-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { ButtonLink } from "@/components/shared/button-link";
import { PAYMENT_STATUS_LABEL, PAYMENT_METHOD_LABEL } from "@/lib/validations/payment";
import type { StudentFees, StudentPaymentRow } from "@/server/services/student-payment-service";
import { cn } from "@/lib/utils";

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

const OVERALL: Record<
  StudentFees["overallStatus"],
  { label: string; className: string }
> = {
  PAID: {
    label: "Paid in full",
    className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  },
  PARTIAL: {
    label: "Part paid",
    className: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  },
  UNPAID: {
    label: "Unpaid",
    className: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
  },
  NONE: { label: "Nothing due", className: "" },
};

const STATUS_TONE: Record<string, string> = {
  PAID: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  PENDING: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  PROCESSING: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  FAILED: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
  REFUNDED: "bg-muted text-muted-foreground",
  PARTIALLY_REFUNDED: "bg-muted text-muted-foreground",
};

/**
 * "Fees" in the learner panel — what was billed, what's paid, and where an
 * instalment plan has got to. Read-only apart from the pay button on a link the
 * office raised; collecting money is the checkout's job, not this page's.
 */
export function StudentFeesView({ fees }: { fees: StudentFees }) {
  const overall = OVERALL[fees.overallStatus];
  const emiProgress =
    fees.emi.totalCount > 0
      ? Math.round((fees.emi.paidCount / fees.emi.totalCount) * 100)
      : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fees & payments"
        description="Your invoices, what's paid and what's still due."
      />

      {fees.payments.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="No payments yet"
          description="Invoices and instalments will appear here once you enrol on a paid program."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Total billed" value={inr(fees.totalBilled)} icon={Receipt} />
            <StatCard
              label="Paid"
              value={inr(fees.totalPaid)}
              icon={CheckCircle2}
              tint="from-emerald-500 to-teal-600"
            />
            <StatCard
              label="Still due"
              value={inr(fees.totalDue)}
              icon={Wallet}
              tint={
                fees.totalDue > 0
                  ? "from-amber-500 to-orange-600"
                  : "from-slate-400 to-slate-500"
              }
              hint={fees.totalDue > 0 ? "Outstanding balance" : "Nothing outstanding"}
            />
            <StatCard
              label="Status"
              value={overall.label}
              icon={BadgeIndianRupee}
              hint={
                fees.hasEmi
                  ? `EMI · ${fees.emi.paidCount} of ${fees.emi.totalCount} paid`
                  : "One-time payment"
              }
            />
          </div>

          {/* ── The EMI plan ─────────────────────────────────────────────── */}
          {fees.hasEmi && (
            <Card>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <CreditCard className="text-muted-foreground size-4" />
                    <p className="font-semibold">Your instalment plan</p>
                  </div>
                  <Badge
                    variant="secondary"
                    className={
                      fees.emi.plan === "ZERO_COST"
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                        : "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300"
                    }
                  >
                    {fees.emi.plan === "ZERO_COST" ? (
                      "Zero-cost EMI"
                    ) : (
                      <>
                        <Percent className="mr-1 size-3" />
                        {fees.emi.interestPercent ?? 0}% interest EMI
                      </>
                    )}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <Figure label="Total EMI" value={inr(fees.emi.total)} />
                  <Figure label="Paid" value={inr(fees.emi.paid)} />
                  <Figure
                    label="Pending"
                    value={inr(fees.emi.pending)}
                    tone={fees.emi.pending > 0 ? "warn" : undefined}
                  />
                  <Figure
                    label="Instalments left"
                    value={`${fees.emi.pendingCount} of ${fees.emi.totalCount}`}
                  />
                </div>

                <div className="space-y-1.5">
                  <Progress value={emiProgress} />
                  <p className="text-muted-foreground text-xs">
                    {fees.emi.paidCount} of {fees.emi.totalCount} instalments paid
                    {fees.emi.plan === "INTEREST" && fees.emi.interestAmount > 0 && (
                      <> · {inr(fees.emi.interestAmount)} interest across the plan</>
                    )}
                  </p>
                </div>

                {fees.emi.nextDueDate && (
                  <div className="bg-muted/50 flex flex-wrap items-center gap-2 rounded-lg p-3 text-sm">
                    <CalendarClock className="text-muted-foreground size-4" />
                    <span>
                      Next instalment{" "}
                      <span className="font-semibold">
                        {inr(fees.emi.nextDueAmount ?? 0)}
                      </span>{" "}
                      due {format(new Date(fees.emi.nextDueDate), "d MMM yyyy")}
                    </span>
                  </div>
                )}

                {fees.emi.overdueCount > 0 && (
                  <div className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
                    <AlertCircle className="mt-0.5 size-4 shrink-0" />
                    <span>
                      {fees.emi.overdueCount} instalment
                      {fees.emi.overdueCount === 1 ? " is" : "s are"} past their due date.
                      Please contact the office to settle.
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* ── Every invoice ───────────────────────────────────────────── */}
          <div className="space-y-3">
            <h2 className="text-sm font-medium">Payment history</h2>
            {fees.payments.map((p) => (
              <PaymentCard key={p.id} payment={p} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Figure({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "warn";
}) {
  return (
    <div>
      <p className="text-muted-foreground text-xs">{label}</p>
      <p
        className={cn(
          "text-lg font-semibold",
          tone === "warn" && "text-amber-600 dark:text-amber-400",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function PaymentCard({ payment: p }: { payment: StudentPaymentRow }) {
  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-medium">
              {p.courseTitle ?? "Academy fees"}
            </p>
            <p className="text-muted-foreground text-xs">
              {p.invoiceNumber} · {format(new Date(p.createdAt), "d MMM yyyy")}
              {p.method && ` · ${PAYMENT_METHOD_LABEL[p.method] ?? p.method}`}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-lg font-semibold">{inr(p.netAmount)}</span>
            <Badge
              variant="secondary"
              className={STATUS_TONE[p.status] ?? ""}
            >
              {PAYMENT_STATUS_LABEL[p.status] ?? p.status}
            </Badge>
          </div>
        </div>

        {/* An interest plan shows both figures, so the finance charge is never
            hidden inside a single blended total. */}
        {p.type === "EMI" && p.principalAmount != null && p.principalAmount < p.netAmount && (
          <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <span>Course fee {inr(p.principalAmount)}</span>
            <span>
              Interest {p.interestPercent ?? 0}% ·{" "}
              {inr(Math.round((p.netAmount - p.principalAmount) * 100) / 100)}
            </span>
          </div>
        )}

        {p.installments.length > 0 && (
          <>
            <Separator />
            <div className="space-y-1.5">
              {p.installments.map((i) => (
                <div
                  key={i.id}
                  className="flex items-center gap-3 text-sm"
                >
                  {i.status === "PAID" ? (
                    <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
                  ) : i.isOverdue ? (
                    <AlertCircle className="size-4 shrink-0 text-rose-500" />
                  ) : (
                    <Clock className="text-muted-foreground size-4 shrink-0" />
                  )}
                  <span className="text-muted-foreground w-20 shrink-0 text-xs">
                    EMI {i.installmentNo}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {inr(i.amount)}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 text-xs",
                      i.isOverdue
                        ? "text-rose-600 dark:text-rose-400"
                        : "text-muted-foreground",
                    )}
                  >
                    {i.status === "PAID" && i.paidAt
                      ? `Paid ${format(new Date(i.paidAt), "d MMM")}`
                      : `Due ${format(new Date(i.dueDate), "d MMM yyyy")}`}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}

        {p.payUrl && (
          <ButtonLink href={p.payUrl} size="sm" className="w-full sm:w-auto">
            Pay now <ArrowUpRight className="size-4" />
          </ButtonLink>
        )}
      </CardContent>
    </Card>
  );
}

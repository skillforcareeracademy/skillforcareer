"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { AlertCircle, CalendarClock, Wallet } from "lucide-react";
import { ButtonLink } from "@/components/shared/button-link";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { StudentPaymentAlert } from "@/server/services/student-payment-service";

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;
const DISMISS_KEY = "sfc.duealert.dismissed";

/**
 * The dashboard's pending-payment reminder: an always-on banner (red once the
 * due date has passed), plus a popup that greets the learner on sign-in when a
 * payment is overdue or due within three days. The popup can be closed, and
 * stays closed for the rest of the session once it is.
 */
export function PaymentDueNotice({ alert }: { alert: StudentPaymentAlert }) {
  const overdue = alert.isOverdue;
  // Overdue, due within three days, or an undated pending balance → greet them.
  const shouldPopup =
    overdue || alert.daysUntilDue == null || alert.daysUntilDue <= 3;

  const dueLabel = alert.nextDueDate
    ? overdue
      ? `was due ${format(new Date(alert.nextDueDate), "d MMM yyyy")}`
      : `due ${format(new Date(alert.nextDueDate), "d MMM yyyy")}`
    : "pending";

  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!shouldPopup) return;
    try {
      if (sessionStorage.getItem(DISMISS_KEY) === alert.paymentId) return;
    } catch {}
    // Open just after mount (not synchronously) — keeps hydration clean and
    // lets the dashboard settle before the greeting appears.
    const t = window.setTimeout(() => setOpen(true), 400);
    return () => window.clearTimeout(t);
  }, [shouldPopup, alert.paymentId]);

  function dismiss() {
    setOpen(false);
    try {
      sessionStorage.setItem(DISMISS_KEY, alert.paymentId);
    } catch {}
  }

  return (
    <>
      {/* The banner — on the dashboard itself, red once it is late. */}
      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4",
          overdue
            ? "border-rose-300 bg-rose-50 dark:border-rose-900/50 dark:bg-rose-950/20"
            : "border-amber-300 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/20",
        )}
      >
        <div className="flex items-start gap-3">
          {overdue ? (
            <AlertCircle className="mt-0.5 size-5 shrink-0 text-rose-600 dark:text-rose-400" />
          ) : (
            <CalendarClock className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400" />
          )}
          <div className="min-w-0">
            <p
              className={cn(
                "text-sm font-semibold",
                overdue
                  ? "text-rose-700 dark:text-rose-300"
                  : "text-amber-800 dark:text-amber-200",
              )}
            >
              {overdue
                ? `Payment overdue · ${inr(alert.totalDue)}`
                : `Payment due · ${inr(alert.totalDue)}`}
            </p>
            <p className="text-muted-foreground text-xs">
              {inr(alert.nextDueAmount)} {dueLabel}
              {alert.courseTitle ? ` · ${alert.courseTitle}` : ""}
              {alert.penaltyAmount > 0
                ? ` · ${inr(alert.penaltyAmount)} late fee added`
                : ""}
            </p>
          </div>
        </div>
        <ButtonLink
          href="/student/payments"
          size="sm"
          variant={overdue ? "default" : "outline"}
        >
          <Wallet className="size-4" /> View &amp; pay
        </ButtonLink>
      </div>

      {/* The sign-in popup — dismissible, once per session. */}
      <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : dismiss())}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {overdue ? (
                <AlertCircle className="size-5 text-rose-600 dark:text-rose-400" />
              ) : (
                <CalendarClock className="size-5 text-amber-600 dark:text-amber-400" />
              )}
              {overdue ? "Payment overdue" : "Payment reminder"}
            </DialogTitle>
            <DialogDescription>
              {overdue
                ? `${inr(alert.nextDueAmount)} ${dueLabel}${
                    alert.penaltyAmount > 0
                      ? `, and a late fee of ${inr(alert.penaltyAmount)} has been added`
                      : ""
                  }. Please clear it to avoid further charges.`
                : `${inr(alert.nextDueAmount)} is ${dueLabel}. Pay now to stay on track.`}
            </DialogDescription>
          </DialogHeader>
          <div
            className={cn(
              "rounded-xl border p-3 text-sm",
              overdue
                ? "border-rose-200 bg-rose-50 dark:border-rose-900/40 dark:bg-rose-950/20"
                : "border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/20",
            )}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Total still due</span>
              <span className="font-semibold tabular-nums">
                {inr(alert.totalDue)}
              </span>
            </div>
            <p className="text-muted-foreground mt-1 text-xs">
              Invoice {alert.invoiceNumber}
              {alert.courseTitle ? ` · ${alert.courseTitle}` : ""}
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={dismiss}>
              Later
            </Button>
            <ButtonLink href="/student/payments" onClick={dismiss}>
              <Wallet className="size-4" /> View &amp; pay
            </ButtonLink>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

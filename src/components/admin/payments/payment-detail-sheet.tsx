"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  BellRing,
  CircleCheckBig,
  HandCoins,
  Loader2,
  ReceiptText,
  Trash2,
  Undo2,
} from "lucide-react";
import { api, ApiError } from "@/lib/api-client";
import {
  INSTALLMENT_STATUS_LABEL,
  PAYMENT_METHOD_LABEL,
  PAYMENT_PROVIDER_LABEL,
  PAYMENT_STATUS_CHOICES,
  PAYMENT_STATUS_LABEL,
} from "@/lib/validations/payment";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { PaymentDetail } from "@/components/admin/payments/types";

export const STATUS_BADGE: Record<string, string> = {
  PENDING:
    "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  PROCESSING: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  PAID: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  FAILED: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
  REFUNDED: "bg-muted text-muted-foreground",
  PARTIALLY_REFUNDED:
    "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
  // The academy's own fee states.
  NO_DUE:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  DUE: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  DEFAULTED: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
  DISCONTINUED: "bg-muted text-muted-foreground",
};

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

export function PaymentDetailSheet({
  paymentId,
  onOpenChange,
}: {
  paymentId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={paymentId != null} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 overflow-y-auto p-0 sm:max-w-lg">
        {paymentId && (
          <DetailBody
            key={paymentId}
            paymentId={paymentId}
            onClosed={() => onOpenChange(false)}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function DetailBody({
  paymentId,
  onClosed,
}: {
  paymentId: string;
  onClosed: () => void;
}) {
  const router = useRouter();
  const [data, setData] = useState<PaymentDetail | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");

  function load() {
    return api
      .get<PaymentDetail>(`/api/payments/${paymentId}`)
      .then(setData)
      .catch(() => setError(true));
  }
  useEffect(() => {
    let alive = true;
    api
      .get<PaymentDetail>(`/api/payments/${paymentId}`)
      .then((d) => alive && setData(d))
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, [paymentId]);

  async function changeStatus(status: string) {
    setBusy(true);
    try {
      await api.patch(`/api/payments/${paymentId}`, { status });
      toast.success("Status updated.");
      await load();
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  }
  async function submitRefund(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post(`/api/payments/${paymentId}/refund`, {
        amount: Number(refundAmount),
        reason: refundReason || undefined,
      });
      toast.success("Refund issued.");
      setRefundOpen(false);
      setRefundAmount("");
      setRefundReason("");
      await load();
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Refund failed.");
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    setBusy(true);
    try {
      await api.del(`/api/payments/${paymentId}`);
      toast.success("Payment deleted.");
      router.refresh();
      onClosed();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Delete failed.");
      setBusy(false);
    }
  }
  /** Record money against one instalment, or forgive its late fee. */
  async function patchInstallment(
    id: string,
    body: Record<string, unknown>,
    done: string,
  ) {
    setBusy(true);
    try {
      await api.patch(`/api/installments/${id}`, body);
      toast.success(done);
      await load();
      router.refresh();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Couldn't save that.",
      );
    } finally {
      setBusy(false);
    }
  }

  /** Forgive — or reinstate — every late fee on the plan at once. */
  async function toggleWaiveAll(waived: boolean) {
    setBusy(true);
    try {
      const res = await api.post<{ message: string }>(
        `/api/payments/${paymentId}/penalty`,
        { waived },
      );
      toast.success(res.message);
      await load();
      router.refresh();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Couldn't save that.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function remind() {
    setBusy(true);
    try {
      await api.post(`/api/payments/${paymentId}/remind`);
      toast.success("Reminder sent.");
      await load();
      router.refresh();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Couldn't send reminder.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return (
      <div className="p-6">
        <SheetHeader className="p-0">
          <SheetTitle>Payment</SheetTitle>
          <SheetDescription>Couldn&apos;t load this payment.</SheetDescription>
        </SheetHeader>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-7 w-2/3" />
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }

  const remaining = data.netAmount - data.refundedTotal;
  const refundable =
    data.status === "PAID" || data.status === "PARTIALLY_REFUNDED";
  const hasPendingInstallment = data.installments.some(
    (i) => i.status !== "PAID" && i.status !== "CANCELLED",
  );
  const outstanding =
    data.summary.outstanding > 0 ||
    (data.type === "EMI" && hasPendingInstallment) ||
    ["PENDING", "PROCESSING", "FAILED", "DUE", "DEFAULTED"].includes(
      data.status,
    );

  return (
    <div className="flex flex-col">
      <SheetHeader className="border-b p-6 pb-4">
        <div className="flex items-start justify-between gap-3 pr-8">
          <SheetTitle className="font-mono text-base">
            {data.invoiceNumber}
          </SheetTitle>
          <Badge
            variant="secondary"
            className={cn("shrink-0", STATUS_BADGE[data.status])}
          >
            {PAYMENT_STATUS_LABEL[data.status] ?? data.status}
          </Badge>
        </div>
        <SheetDescription>
          {data.student.name} · {data.student.email}
        </SheetDescription>
      </SheetHeader>

      <div className="space-y-6 p-6">
        {/* Amount breakdown */}
        <div className="rounded-2xl border p-5">
          <p className="text-3xl font-bold">{inr(data.netAmount)}</p>
          <p className="text-muted-foreground text-xs">
            {PAYMENT_PROVIDER_LABEL[data.provider] ?? data.provider} ·{" "}
            {data.type.replace("_", " ")}
          </p>
          <dl className="mt-4 space-y-1.5 border-t pt-3 text-sm">
            <Line label="Amount" value={inr(data.amount)} />
            {data.discountAmount > 0 && (
              <Line label="Discount" value={`− ${inr(data.discountAmount)}`} />
            )}
            {data.taxAmount > 0 && (
              <Line label="Tax" value={inr(data.taxAmount)} />
            )}
            <Line label="Net" value={inr(data.netAmount)} strong />
            {data.refundedTotal > 0 && (
              <Line label="Refunded" value={`− ${inr(data.refundedTotal)}`} />
            )}
          </dl>
        </div>

        {/* Meta */}
        <dl className="space-y-2 text-sm">
          {data.courseTitle && <Line label="Course" value={data.courseTitle} />}
          {!data.courseTitle && data.purpose && (
            <Line label="For" value={data.purpose} />
          )}
          {data.method && (
            <Line
              label="Method"
              value={PAYMENT_METHOD_LABEL[data.method] ?? data.method}
            />
          )}
          {data.account && (
            <Line label="Received in" value={data.account.name} />
          )}
          <Line
            label="Created"
            value={format(new Date(data.createdAt), "d MMM yyyy, h:mm a")}
          />
          {data.paidAt && (
            <Line
              label="Paid"
              value={format(new Date(data.paidAt), "d MMM yyyy, h:mm a")}
            />
          )}
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Status</dt>
            <dd>
              <Select
                value={data.status}
                onValueChange={(v) => v && changeStatus(v)}
                disabled={busy}
              >
                <SelectTrigger className="h-7 w-44" size="sm">
                  <SelectValue>
                    {(v) => PAYMENT_STATUS_LABEL[String(v)]}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_STATUS_CHOICES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {PAYMENT_STATUS_LABEL[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </dd>
          </div>
        </dl>

        {outstanding && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-50 p-3 dark:bg-amber-500/10">
            <p className="text-sm text-amber-800 dark:text-amber-200">
              {data.summary.outstanding > 0
                ? `${inr(data.summary.outstanding)} is still owed on this payment.`
                : "This payment has an outstanding balance."}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={remind}
              disabled={busy}
            >
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <BellRing className="size-4" />
              )}
              Send reminder
            </Button>
          </div>
        )}

        {/* Where the plan stands. One figure the office actually chases —
            what is still owed, late fees included. */}
        {(data.installments.length > 0 || data.summary.outstanding > 0) && (
          <div
            className={cn(
              "rounded-2xl border p-4",
              data.summary.daysLate > 0 &&
                "border-rose-300 dark:border-rose-900",
            )}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-medium">Still owed</p>
              <p className="text-xl font-semibold tabular-nums">
                {inr(data.summary.outstanding)}
              </p>
            </div>
            <dl className="mt-3 space-y-1.5 border-t pt-3 text-sm">
              <Line label="Payable" value={inr(data.summary.payable)} />
              <Line label="Received" value={inr(data.summary.paid)} />
              {data.summary.penalty > 0 && (
                <Line label="Late fees" value={inr(data.summary.penalty)} />
              )}
              {data.summary.nextDueDate && (
                <Line
                  label="Next due"
                  value={`${inr(data.summary.nextDueAmount)} on ${format(new Date(data.summary.nextDueDate), "d MMM yyyy")}`}
                />
              )}
              {data.summary.daysLate > 0 && (
                <Line
                  label="Overdue by"
                  value={`${data.summary.daysLate} day${data.summary.daysLate === 1 ? "" : "s"}`}
                />
              )}
            </dl>
            <p className="text-muted-foreground mt-3 border-t pt-3 text-xs">
              {data.penaltyWaived
                ? "Late fees are waived on this plan."
                : `${data.effectiveTerms.graceDays} day grace period, then ${
                    data.effectiveTerms.penaltyFlat > 0
                      ? inr(data.effectiveTerms.penaltyFlat)
                      : `${data.effectiveTerms.penaltyPercent}%`
                  }.`}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              disabled={busy}
              onClick={() => toggleWaiveAll(!data.penaltyWaived)}
            >
              <HandCoins className="size-4" />
              {data.penaltyWaived
                ? "Reinstate late fees"
                : "Waive all late fees"}
            </Button>
          </div>
        )}

        {data.installments.length > 0 && (
          <section>
            <p className="mb-3 flex items-center gap-2 text-sm font-medium">
              <ReceiptText className="text-muted-foreground size-4" />{" "}
              Installments
              <span className="text-muted-foreground font-normal">
                ({data.installments.length})
              </span>
            </p>
            <ul className="divide-y rounded-xl border">
              {data.installments.map((i) => {
                const settled = i.status === "PAID" || i.status === "CANCELLED";
                return (
                  <li key={i.id} className="space-y-2 p-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium">
                          #{i.installmentNo} · {inr(i.amount)}
                          {i.penaltyAmount > 0 && (
                            <span className="font-normal text-rose-600 dark:text-rose-400">
                              {" "}
                              + {inr(i.penaltyAmount)} late fee
                            </span>
                          )}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          Due {format(new Date(i.dueDate), "d MMM yyyy")}
                          {i.paidAmount > 0 && i.status !== "PAID"
                            ? ` · ${inr(i.paidAmount)} received`
                            : ""}
                          {i.paidAt
                            ? ` · paid ${format(new Date(i.paidAt), "d MMM yyyy")}`
                            : ""}
                        </p>
                      </div>
                      <Badge
                        variant="secondary"
                        className={cn(
                          "shrink-0",
                          i.status === "PAID"
                            ? STATUS_BADGE.PAID
                            : i.status === "OVERDUE"
                              ? STATUS_BADGE.FAILED
                              : "text-muted-foreground",
                        )}
                      >
                        {INSTALLMENT_STATUS_LABEL[i.status] ?? i.status}
                      </Badge>
                    </div>
                    {!settled && (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy}
                          onClick={() =>
                            patchInstallment(
                              i.id,
                              { status: "PAID" },
                              `Instalment #${i.installmentNo} marked paid.`,
                            )
                          }
                        >
                          <CircleCheckBig className="size-4" /> Mark paid
                        </Button>
                        {i.penaltyAmount > 0 && !i.penaltyWaived && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={busy}
                            onClick={() =>
                              patchInstallment(
                                i.id,
                                { penaltyWaived: true },
                                "Late fee waived.",
                              )
                            }
                          >
                            <HandCoins className="size-4" /> Waive late fee
                          </Button>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* Refunds */}
        <section>
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-sm font-medium">
              <ReceiptText className="text-muted-foreground size-4" /> Refunds
              <span className="text-muted-foreground font-normal">
                ({data.refunds.length})
              </span>
            </p>
            {refundable && remaining > 0 && !refundOpen && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRefundOpen(true)}
              >
                <Undo2 className="size-4" /> Issue refund
              </Button>
            )}
          </div>

          {refundOpen && (
            <form
              onSubmit={submitRefund}
              className="mb-3 space-y-2 rounded-xl border p-3"
            >
              <div className="space-y-1">
                <Label htmlFor="refund-amt" className="text-xs">
                  Amount (up to {inr(remaining)})
                </Label>
                <Input
                  id="refund-amt"
                  type="number"
                  min={1}
                  max={remaining}
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(e.target.value)}
                  className="w-40"
                />
              </div>
              <Input
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                placeholder="Reason (optional)"
              />
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setRefundOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={busy || !refundAmount}
                >
                  {busy && <Loader2 className="size-4 animate-spin" />}
                  Refund
                </Button>
              </div>
            </form>
          )}

          {data.refunds.length === 0 ? (
            <p className="text-muted-foreground text-sm">No refunds.</p>
          ) : (
            <ul className="divide-y rounded-xl border">
              {data.refunds.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-3 p-3 text-sm"
                >
                  <div className="min-w-0">
                    <p className="font-medium">{inr(r.amount)}</p>
                    {r.reason && (
                      <p className="text-muted-foreground truncate text-xs">
                        {r.reason}
                      </p>
                    )}
                  </div>
                  <span className="text-muted-foreground text-xs">
                    {format(new Date(r.createdAt), "d MMM")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Danger */}
        <div className="border-t pt-4">
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={remove}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="size-4" /> Delete payment
          </Button>
        </div>
      </div>
    </div>
  );
}

function Line({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn(strong ? "font-semibold" : "", "text-right")}>
        {value}
      </dd>
    </div>
  );
}

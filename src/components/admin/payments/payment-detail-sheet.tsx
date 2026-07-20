"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { toast } from "sonner";
import { Loader2, Undo2, Trash2, ReceiptText } from "lucide-react";
import { api, ApiError } from "@/lib/api-client";
import {
  PAYMENT_STATUSES,
  PAYMENT_STATUS_LABEL,
  PAYMENT_PROVIDER_LABEL,
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

interface Refund {
  id: string;
  amount: number;
  reason: string | null;
  status: string;
  createdAt: string;
}
interface Detail {
  id: string;
  invoiceNumber: string;
  student: { name: string; email: string; avatarUrl: string | null };
  courseTitle: string | null;
  amount: number;
  discountAmount: number;
  taxAmount: number;
  netAmount: number;
  currency: string;
  status: string;
  provider: string;
  type: string;
  providerPaymentId: string | null;
  createdAt: string;
  paidAt: string | null;
  refunds: Refund[];
  refundedTotal: number;
}

export const STATUS_BADGE: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  PROCESSING: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  PAID: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  FAILED: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
  REFUNDED: "bg-muted text-muted-foreground",
  PARTIALLY_REFUNDED: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
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
        {paymentId && <DetailBody key={paymentId} paymentId={paymentId} onClosed={() => onOpenChange(false)} />}
      </SheetContent>
    </Sheet>
  );
}

function DetailBody({ paymentId, onClosed }: { paymentId: string; onClosed: () => void }) {
  const router = useRouter();
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");

  function load() {
    return api.get<Detail>(`/api/payments/${paymentId}`).then(setData).catch(() => setError(true));
  }
  useEffect(() => {
    let alive = true;
    api
      .get<Detail>(`/api/payments/${paymentId}`)
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
  const refundable = data.status === "PAID" || data.status === "PARTIALLY_REFUNDED";

  return (
    <div className="flex flex-col">
      <SheetHeader className="border-b p-6 pb-4">
        <div className="flex items-start justify-between gap-3 pr-8">
          <SheetTitle className="font-mono text-base">{data.invoiceNumber}</SheetTitle>
          <Badge variant="secondary" className={cn("shrink-0", STATUS_BADGE[data.status])}>
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
            {PAYMENT_PROVIDER_LABEL[data.provider] ?? data.provider} · {data.type.replace("_", " ")}
          </p>
          <dl className="mt-4 space-y-1.5 border-t pt-3 text-sm">
            <Line label="Amount" value={inr(data.amount)} />
            {data.discountAmount > 0 && <Line label="Discount" value={`− ${inr(data.discountAmount)}`} />}
            {data.taxAmount > 0 && <Line label="Tax" value={inr(data.taxAmount)} />}
            <Line label="Net" value={inr(data.netAmount)} strong />
            {data.refundedTotal > 0 && (
              <Line label="Refunded" value={`− ${inr(data.refundedTotal)}`} />
            )}
          </dl>
        </div>

        {/* Meta */}
        <dl className="space-y-2 text-sm">
          {data.courseTitle && <Line label="Course" value={data.courseTitle} />}
          <Line label="Created" value={format(new Date(data.createdAt), "d MMM yyyy, h:mm a")} />
          {data.paidAt && <Line label="Paid" value={format(new Date(data.paidAt), "d MMM yyyy, h:mm a")} />}
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Status</dt>
            <dd>
              <Select value={data.status} onValueChange={(v) => v && changeStatus(v)} disabled={busy}>
                <SelectTrigger className="h-7 w-44" size="sm">
                  <SelectValue>{(v) => PAYMENT_STATUS_LABEL[String(v)]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {PAYMENT_STATUS_LABEL[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </dd>
          </div>
        </dl>

        {/* Refunds */}
        <section>
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-sm font-medium">
              <ReceiptText className="size-4 text-muted-foreground" /> Refunds
              <span className="text-muted-foreground font-normal">({data.refunds.length})</span>
            </p>
            {refundable && remaining > 0 && !refundOpen && (
              <Button variant="outline" size="sm" onClick={() => setRefundOpen(true)}>
                <Undo2 className="size-4" /> Issue refund
              </Button>
            )}
          </div>

          {refundOpen && (
            <form onSubmit={submitRefund} className="mb-3 space-y-2 rounded-xl border p-3">
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
                <Button type="button" variant="ghost" size="sm" onClick={() => setRefundOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={busy || !refundAmount}>
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
                <li key={r.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium">{inr(r.amount)}</p>
                    {r.reason && <p className="text-muted-foreground truncate text-xs">{r.reason}</p>}
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

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn(strong ? "font-semibold" : "", "text-right")}>{value}</dd>
    </div>
  );
}
